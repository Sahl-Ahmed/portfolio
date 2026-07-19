/**
 * Centralized IndexNow Integration Service.
 * Allows instant search engine notifications (Bing, Yandex, Seznam, etc.) when content is modified.
 * 
 * Prepares requests for:
 * - New Projects
 * - Updated Projects
 * - Deleted Projects
 * - Gallery Changes
 * - Achievements
 * 
 * Automatically remains fully inactive until a valid API Key is configured in SEO_CONFIG.
 */

import { SEO_CONFIG } from './config';
import { getBaseUrl } from './seo';

export interface IndexNowRequest {
  host: string;
  key: string;
  keyLocation?: string;
  urlList: string[];
}

/**
 * Sends a list of URLs to the IndexNow protocol endpoints (e.g. Bing or Yandex)
 */
export async function submitToIndexNow(urls: string[]): Promise<{ success: boolean; message: string }> {
  const { apiKey, isActive, keyLocation } = SEO_CONFIG.indexNow;
  
  if (!isActive || !apiKey) {
    const inactiveMsg = "IndexNow is prepared but disabled. Configure an API key to activate instant indexing.";
    console.info(`[IndexNow:Prepared/Disabled] ${inactiveMsg}`, urls);
    return { success: false, message: inactiveMsg };
  }

  const host = typeof window !== 'undefined' 
    ? window.location.hostname 
    : getBaseUrl().replace(/^https?:\/\//, "");

  const payload: IndexNowRequest = {
    host,
    key: apiKey,
    keyLocation: keyLocation,
    urlList: urls.map(url => {
      // Ensure absolute URLs
      if (url.startsWith('/')) {
        return `${getBaseUrl()}${url}`;
      }
      return url;
    })
  };

  try {
    // Send to Bing's IndexNow engine as the default protocol dispatcher
    const response = await fetch("https://www.bing.com/indexnow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 200 || response.status === 202) {
      console.log("[IndexNow:Success] Successfully notified search engines about content changes.", payload);
      return { success: true, message: "URLs successfully submitted to IndexNow." };
    } else {
      const errorMsg = `IndexNow api returned status: ${response.status}`;
      console.error("[IndexNow:Error]", errorMsg);
      return { success: false, message: errorMsg };
    }
  } catch (error: any) {
    console.error("[IndexNow:Exception] Network error during index submission:", error);
    return { success: false, message: error.message || "Network error" };
  }
}

// ---------------------------------------------------------------------------
// Action-Specific IndexNow Dispatch Preparers
// ---------------------------------------------------------------------------

/**
 * 1. Prepare and submit request for a Project (New / Updated / Deleted).
 */
export function prepareProjectIndexRequest(projectId: string, actionType: 'create' | 'update' | 'delete') {
  const baseUrl = getBaseUrl();
  const projectUrl = `${baseUrl}/projects/${projectId}`;
  const projectsListUrl = `${baseUrl}/projects`;
  const homeUrl = `${baseUrl}/`;

  console.log(`[IndexNow:Preparing] Project ${actionType.toUpperCase()}: ${projectId}`);
  
  // Submit the specific project page, the projects collection page, and the homepage
  submitToIndexNow([projectUrl, projectsListUrl, homeUrl]);
}

/**
 * 2. Prepare and submit request for a Gallery Item Change (New / Updated / Deleted).
 */
export function prepareGalleryIndexRequest(itemId: string, actionType: 'create' | 'update' | 'delete') {
  const baseUrl = getBaseUrl();
  const galleryUrl = `${baseUrl}/gallery/${itemId}`;
  const galleryListUrl = `${baseUrl}/gallery`;
  const homeUrl = `${baseUrl}/`;

  console.log(`[IndexNow:Preparing] Gallery ${actionType.toUpperCase()}: ${itemId}`);

  submitToIndexNow([galleryUrl, galleryListUrl, homeUrl]);
}

/**
 * 3. Prepare and submit request for an Achievement timeline change.
 */
export function prepareAchievementIndexRequest() {
  const baseUrl = getBaseUrl();
  const achievementsUrl = `${baseUrl}/achievements`;
  const homeUrl = `${baseUrl}/`;

  console.log(`[IndexNow:Preparing] Achievements update`);

  submitToIndexNow([achievementsUrl, homeUrl]);
}
