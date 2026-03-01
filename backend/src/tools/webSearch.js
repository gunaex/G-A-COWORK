// backend/src/tools/webSearch.js
// Web Search tool using Tavily API

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

/**
 * Search the web using Tavily API
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results
 * @returns {string} Formatted search results
 */
async function webSearch(query, maxResults = 5) {
  if (!TAVILY_API_KEY) {
    return `[Web Search Disabled] TAVILY_API_KEY not set in environment.\nQuery was: "${query}"\n\nTo enable real web search, add your Tavily API key to the .env file:\nTAVILY_API_KEY=tvly-xxxxxxxx`;
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TAVILY_API_KEY}`
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    let result = '';

    if (data.answer) {
      result += `📋 Quick Answer:\n${data.answer}\n\n`;
    }

    if (data.results && data.results.length > 0) {
      result += `🔍 Search Results for: "${query}"\n\n`;
      data.results.forEach((item, index) => {
        result += `[${index + 1}] ${item.title}\n`;
        result += `    URL: ${item.url}\n`;
        result += `    ${item.content}\n\n`;
      });
    } else {
      result += `No results found for "${query}".`;
    }

    return result.trim();
  } catch (error) {
    return `Web search failed: ${error.message}\n\nQuery: "${query}"`;
  }
}

// Tool declaration for Gemini function calling
const webSearchDeclaration = {
  name: 'web_search',
  description: 'Search the web for current, up-to-date information on any topic. Use this to find recent news, technical documentation, research papers, or any information that may have changed recently.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'The search query to look up. Be specific and descriptive for better results.'
      },
      max_results: {
        type: 'NUMBER',
        description: 'Maximum number of search results to return (1-10, default: 5)'
      }
    },
    required: ['query']
  }
};

module.exports = { webSearch, webSearchDeclaration };
