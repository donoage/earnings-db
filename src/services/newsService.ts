import axios from 'axios';
import { PrismaClient, News } from '@prisma/client';
import { redisClient } from '../config/redis';

const prisma = new PrismaClient();
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const CACHE_TTL = 3600; // 1 hour cache for news

interface PolygonNewsResult {
  id: string;
  publisher: {
    name: string;
    homepage_url?: string;
    logo_url?: string;
    favicon_url?: string;
  };
  title: string;
  author?: string;
  published_utc: string;
  article_url: string;
  tickers: string[];
  image_url?: string;
  description?: string;
  keywords?: string[];
  insights?: Array<{
    ticker: string;
    sentiment?: string;
    sentiment_reasoning?: string;
  }>;
}

interface PolygonNewsResponse {
  results?: PolygonNewsResult[];
  status: string;
  next_url?: string;
  count?: number;
}

interface NewsData {
  id: string;
  ticker?: string;
  title: string;
  author?: string;
  publishedUtc: Date;
  articleUrl: string;
  imageUrl?: string;
  description?: string;
  publisherName: string;
  publisherUrl?: string;
  publisherLogo?: string;
  tickers: string[];
  keywords: string[];
  sentiment?: string;
  sentimentScore?: number;
}

class NewsService {
  /**
   * Get news articles with caching
   */
  async getNews(params: {
    ticker?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<NewsData[]> {
    const { ticker, limit = 50, dateFrom, dateTo } = params;
    
    // Create cache key
    const cacheKey = `news:${ticker || 'all'}:${dateFrom || ''}:${dateTo || ''}:${limit}`;
    
    // Check Redis cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      console.log(`[News Service] Cache hit for ${ticker || 'general news'}`);
      return cached;
    }
    
    // Check database
    const dbNews = await this.getFromDatabase(params);
    if (dbNews.length > 0) {
      console.log(`[News Service] Found ${dbNews.length} articles in database for ${ticker || 'general news'}`);
      await this.saveToCache(cacheKey, dbNews);
      return dbNews;
    }
    
    // Fetch from Polygon API
    console.log(`[News Service] Fetching from Polygon for ${ticker || 'general news'}`);
    const polygonNews = await this.fetchFromPolygon(params);
    
    if (polygonNews.length > 0) {
      // Save to database
      await this.saveToDatabase(polygonNews);
      // Cache the results
      await this.saveToCache(cacheKey, polygonNews);
    }
    
    return polygonNews;
  }

  /**
   * Fetch news from Polygon API
   */
  private async fetchFromPolygon(params: {
    ticker?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<NewsData[]> {
    const { ticker, limit = 50, dateFrom, dateTo } = params;
    
    if (!POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY not configured');
    }
    
    try {
      const url = 'https://api.polygon.io/v2/reference/news';
      const queryParams: any = {
        apiKey: POLYGON_API_KEY,
        limit: Math.min(limit, 1000),
        order: 'desc',
        sort: 'published_utc',
      };
      
      if (ticker) {
        queryParams.ticker = ticker;
      }
      
      if (dateFrom) {
        queryParams['published_utc.gte'] = dateFrom;
      }
      
      if (dateTo) {
        queryParams['published_utc.lte'] = dateTo;
      }
      
      const response = await axios.get<PolygonNewsResponse>(url, {
        params: queryParams,
        timeout: 10000,
      });
      
      if (response.data.status !== 'OK' || !response.data.results) {
        console.error('[News Service] Polygon API error:', response.data);
        return [];
      }
      
      const newsData: NewsData[] = response.data.results.map(article => {
        // Extract sentiment from insights if available
        let sentiment: string | undefined;
        let sentimentScore: number | undefined;
        
        if (article.insights && article.insights.length > 0) {
          const insight = article.insights[0];
          sentiment = insight.sentiment;
          // Simple sentiment scoring: positive = 0.7, negative = -0.7, neutral = 0
          if (sentiment === 'positive') sentimentScore = 0.7;
          else if (sentiment === 'negative') sentimentScore = -0.7;
          else if (sentiment === 'neutral') sentimentScore = 0;
        }
        
        return {
          id: article.id,
          ticker: ticker || (article.tickers && article.tickers.length > 0 ? article.tickers[0] : undefined),
          title: article.title,
          author: article.author,
          publishedUtc: new Date(article.published_utc),
          articleUrl: article.article_url,
          imageUrl: article.image_url,
          description: article.description,
          publisherName: article.publisher.name,
          publisherUrl: article.publisher.homepage_url,
          publisherLogo: article.publisher.logo_url || article.publisher.favicon_url,
          tickers: article.tickers || [],
          keywords: article.keywords || [],
          sentiment,
          sentimentScore,
        };
      });
      
      console.log(`[News Service] Fetched ${newsData.length} articles from Polygon`);
      return newsData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log(`[News Service] No news found for ${ticker || 'general'}`);
        return [];
      }
      console.error('[News Service] Error fetching from Polygon:', error.message);
      throw error;
    }
  }

  /**
   * Get news from database
   */
  private async getFromDatabase(params: {
    ticker?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<NewsData[]> {
    const { ticker, limit = 50, dateFrom, dateTo } = params;
    
    try {
      const where: any = {};
      
      if (ticker) {
        where.ticker = ticker;
      }
      
      if (dateFrom || dateTo) {
        where.publishedUtc = {};
        if (dateFrom) where.publishedUtc.gte = new Date(dateFrom);
        if (dateTo) where.publishedUtc.lte = new Date(dateTo);
      }
      
      const news = await prisma.news.findMany({
        where,
        orderBy: { publishedUtc: 'desc' },
        take: limit,
      });
      
      return news.map(this.dbToNewsData);
    } catch (error: any) {
      console.error('[News Service] Database error:', error.message);
      return [];
    }
  }

  /**
   * Save news to database
   */
  private async saveToDatabase(newsData: NewsData[]): Promise<void> {
    try {
      for (const article of newsData) {
        await prisma.news.upsert({
          where: { id: article.id },
          update: {
            ticker: article.ticker,
            title: article.title,
            author: article.author,
            publishedUtc: article.publishedUtc,
            articleUrl: article.articleUrl,
            imageUrl: article.imageUrl,
            description: article.description,
            publisherName: article.publisherName,
            publisherUrl: article.publisherUrl,
            publisherLogo: article.publisherLogo,
            tickers: article.tickers,
            keywords: article.keywords,
            sentiment: article.sentiment,
            sentimentScore: article.sentimentScore,
            updatedAt: new Date(),
          },
          create: {
            id: article.id,
            ticker: article.ticker,
            title: article.title,
            author: article.author,
            publishedUtc: article.publishedUtc,
            articleUrl: article.articleUrl,
            imageUrl: article.imageUrl,
            description: article.description,
            publisherName: article.publisherName,
            publisherUrl: article.publisherUrl,
            publisherLogo: article.publisherLogo,
            tickers: article.tickers,
            keywords: article.keywords,
            sentiment: article.sentiment,
            sentimentScore: article.sentimentScore,
          },
        });
      }
      console.log(`[News Service] Saved ${newsData.length} articles to database`);
    } catch (error: any) {
      console.error('[News Service] Error saving to database:', error.message);
    }
  }

  /**
   * Convert database record to NewsData
   */
  private dbToNewsData(news: News): NewsData {
    return {
      id: news.id,
      ticker: news.ticker || undefined,
      title: news.title,
      author: news.author || undefined,
      publishedUtc: news.publishedUtc,
      articleUrl: news.articleUrl,
      imageUrl: news.imageUrl || undefined,
      description: news.description || undefined,
      publisherName: news.publisherName,
      publisherUrl: news.publisherUrl || undefined,
      publisherLogo: news.publisherLogo || undefined,
      tickers: news.tickers,
      keywords: news.keywords,
      sentiment: news.sentiment || undefined,
      sentimentScore: news.sentimentScore ? parseFloat(news.sentimentScore.toString()) : undefined,
    };
  }

  /**
   * Get from Redis cache
   */
  private async getFromCache(key: string): Promise<NewsData[] | null> {
    try {
      const cached = await redisClient.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error: any) {
      console.error('[News Service] Redis get error:', error.message);
    }
    return null;
  }

  /**
   * Save to Redis cache
   */
  private async saveToCache(key: string, data: NewsData[]): Promise<void> {
    try {
      await redisClient.setex(key, CACHE_TTL, JSON.stringify(data));
    } catch (error: any) {
      console.error('[News Service] Redis set error:', error.message);
    }
  }

  /**
   * Clear cache for a specific ticker or all news
   */
  async clearCache(ticker?: string): Promise<void> {
    try {
      const pattern = ticker ? `news:${ticker}:*` : 'news:*';
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`[News Service] Cleared ${keys.length} cache entries`);
      }
    } catch (error: any) {
      console.error('[News Service] Error clearing cache:', error.message);
    }
  }
}

export const newsService = new NewsService();

