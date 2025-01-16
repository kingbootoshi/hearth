import axios from 'axios';
import { URL } from 'url';
import dotenv from 'dotenv';
import { createModuleLogger } from '../../../utils/logger';
dotenv.config();

interface AuthorInfo {
  login: string;
  htmlUrl: string;
  publicRepos: number;
  createdAt: string;
}

interface RepoMetadata {
  fullName: string;
  description: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  defaultBranch: string;
  createdAt: string;
  isFork: boolean;
  parentFullName: string;
  parentHtmlUrl: string;
}

interface RepoActivity {
  totalCommits: number;
  contributorsCount: number;
  openPullRequests: number;
}

interface CodeData {
  directoryTree: string;
  fileContents: string;
  metrics?: CodebaseMetrics;
}

export interface GitHubData {
  authorInfo: AuthorInfo;
  repoMetadata: RepoMetadata;
  repoActivity: RepoActivity;
  codeData: CodeData;
}

interface GitHubUserResponse {
  login: string;
  html_url: string;
  public_repos: number;
  created_at: string;
}

interface GitHubRepoResponse {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  fork: boolean;
  parent?: {
    full_name: string;
    html_url: string;
  };
}

interface GitHubContentResponse {
  name: string;
  path: string;
  type: 'file' | 'dir';
  url: string;
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
}

interface GitHubCommitsResponse {
  length: number;
}

interface GitHubContributorsResponse {
  length: number;
}

interface GitHubPullsResponse {
  length: number;
}

// Add this interface to track size metrics
interface CodebaseMetrics {
  totalCharacters: number;
  totalFiles: number;
}

// Add metrics parameter to buildDirectoryTree return type
interface TreeResult {
  tree: string;
  contents: string;
  totalSize: number;
  metrics: CodebaseMetrics;
}

const logger = createModuleLogger('getGithubData');
const MAX_CODEBASE_SIZE = 400000;

/**
 * Helper: parse GitHub URL to extract {owner, repo}.
 */
function parseGitHubUrl(githubUrl: string): { owner: string; repo: string } {
  const parsed = new URL(githubUrl);
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    throw new Error('Invalid GitHub URL (unable to parse owner/repo).');
  }
  const [owner, repo] = pathParts;
  return { owner, repo };
}

/**
 * Fetch user/owner data to see how active they’ve been on GitHub.
 */
async function fetchAuthorInfo(
  owner: string,
  token?: string
): Promise<AuthorInfo> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/users/${owner}`;
  const response = await axios.get<GitHubUserResponse>(url, { headers });
  const data = response.data;

  return {
    login: data.login,
    htmlUrl: data.html_url,
    publicRepos: data.public_repos,
    createdAt: data.created_at,
  };
}

/**
 * Fetch basic repo info: stars, forks, watchers, etc. Also detect if repo is fork.
 */
async function fetchRepoMetadata(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoMetadata> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const response = await axios.get<GitHubRepoResponse>(url, { headers });
  const data = response.data;

  const isFork = data.fork;
  const parentFullName = isFork && data.parent?.full_name ? data.parent.full_name : '';
  const parentHtmlUrl = isFork && data.parent?.html_url ? data.parent.html_url : '';

  return {
    fullName: data.full_name,
    description: data.description || '',
    stars: data.stargazers_count,
    forks: data.forks_count,
    watchers: data.watchers_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    createdAt: data.created_at,
    isFork,
    parentFullName,
    parentHtmlUrl
  };
}

/**
 * Fetch approximate total commits, # contributors, # open PRs, etc.
 */
async function fetchRepoActivity(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoActivity> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let totalCommits = 0;
  let contributorsCount = 0;
  let openPullRequests = 0;

  try {
    const commitsUrl = `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`;
    const response = await axios.get<GitHubCommitsResponse>(commitsUrl, { headers });
    const linkHeader = response.headers.link;
    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (match) {
        totalCommits = parseInt(match[1], 10);
      } else {
        totalCommits = response.data.length;
      }
    } else {
      totalCommits = response.data.length;
    }
  } catch (error) {
    console.warn('Could not fetch commits count:', error);
  }

  try {
    const contributorsUrl = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`;
    const response = await axios.get<GitHubContributorsResponse>(contributorsUrl, { headers });
    const linkHeader = response.headers.link;
    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (match) {
        contributorsCount = parseInt(match[1], 10);
      } else {
        contributorsCount = response.data.length;
      }
    } else {
      contributorsCount = response.data.length;
    }
  } catch (error) {
    console.warn('Could not fetch contributors count:', error);
  }

  try {
    const pullsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=1`;
    const response = await axios.get<GitHubPullsResponse>(pullsUrl, { headers });
    const linkHeader = response.headers.link;
    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (match) {
        openPullRequests = parseInt(match[1], 10);
      } else {
        openPullRequests = response.data.length;
      }
    } else {
      openPullRequests = response.data.length;
    }
  } catch (error) {
    console.warn('Could not fetch PR count:', error);
  }

  return {
    totalCommits,
    contributorsCount,
    openPullRequests,
  };
}

/**
 * Recursively fetch directory contents and build a tree while also accumulating file contents.
 * If total codebase exceeds MAX_CODEBASE_SIZE, we truncate.
 */
async function buildDirectoryTree(
  owner: string,
  repo: string,
  path = '',
  token: string | undefined,
  indent = 0,
  fileExtensions = ['.ts', '.js', '.py', '.md', '.html', '.css', '.jsx', '.rst', '.rs', '.toml'],
  treeSoFar = '',
  fileContentsSoFar = '',
  totalSizeSoFar = 0,
  metrics: CodebaseMetrics = { totalCharacters: 0, totalFiles: 0 }
): Promise<TreeResult> {
  // Add rate limit check
  if (!token) {
    logger.warn('No GitHub token provided - API rate limits will apply');
  }

  // Add retry logic for rate limits
  const retryConfig = {
    retries: 3,
    backoff: 1000,
  };

  // If we've already hit the limit, just return with the cutoff message appended if not already
  if (totalSizeSoFar >= MAX_CODEBASE_SIZE) {
    return {
      tree: treeSoFar + '## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n',
      contents: fileContentsSoFar + '\n## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n',
      totalSize: totalSizeSoFar,
      metrics
    };
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    logger.debug({ path, url: baseUrl }, 'Fetching directory contents');
    
    const response = await axios.get<GitHubContentResponse[]>(baseUrl, { 
      headers,
      validateStatus: (status) => {
        if (status === 403) {
          logger.error('GitHub API rate limit exceeded');
          return false;
        }
        if (status === 404) {
          logger.error('GitHub path not found');
          return false;
        }
        return status >= 200 && status < 300;
      }
    });

    // Add response data logging
    logger.debug(
      { 
        itemCount: response.data.length,
        path 
      }, 
      'Directory contents retrieved'
    );

    const items = response.data;

    for (const item of items) {
      if (totalSizeSoFar >= MAX_CODEBASE_SIZE) {
        // Already over limit, break the loop
        break;
      }

      // Skip .github folder and node_modules
      if (item.path.includes('.github') || item.path.includes('node_modules')) {
        continue;
      }

      if (item.type === 'dir') {
        treeSoFar += '    '.repeat(indent) + `[${item.name}/]\n`;
        try {
          const subResult = await buildDirectoryTree(
            owner,
            repo,
            item.path,
            token,
            indent + 1,
            fileExtensions,
            '',
            '',
            totalSizeSoFar,
            metrics
          );
          treeSoFar += subResult.tree;
          fileContentsSoFar += subResult.contents;
          totalSizeSoFar = subResult.totalSize;
          metrics = subResult.metrics; // Update metrics with subdirectory results
        } catch (error) {
          logger.warn({ error, path: item.path }, 'Error processing subdirectory');
          treeSoFar += '    '.repeat(indent + 1) + `[Error reading directory]\n`;
        }
      } else {
        treeSoFar += '    '.repeat(indent) + `${item.name}\n`;

        // Only fetch content for specific file types and limit file size
        if (fileExtensions.some(ext => item.name.toLowerCase().endsWith(ext))) {
          try {
            logger.debug(
              { 
                file: item.name, 
                path: item.path 
              }, 
              'Processing file content'
            );
            const fileResp = await axios.get<GitHubFileResponse>(item.url, { headers });
            const fileInfo = fileResp.data;
            
            // Skip files larger than 1MB
            const contentSize = Buffer.from(fileInfo.content, 'base64').length;
            if (contentSize > 1024 * 1024) {
              logger.warn({ path: item.path, size: contentSize }, 'File too large, skipping content');
              fileContentsSoFar += `\n${'    '.repeat(indent)}${item.path}: [File too large to display]\n`;
            } else {
              let decodedContent = '';
              if (fileInfo.encoding === 'base64') {
                const buff = Buffer.from(fileInfo.content, 'base64');
                decodedContent = buff.toString('utf-8');
              } else {
                decodedContent = fileInfo.content;
              }

              // Update metrics
              metrics.totalCharacters += decodedContent.length;
              metrics.totalFiles += 1;

              // Check size before appending
              if (totalSizeSoFar + decodedContent.length >= MAX_CODEBASE_SIZE) {
                const remain = MAX_CODEBASE_SIZE - totalSizeSoFar;
                fileContentsSoFar += `\n${'    '.repeat(indent)}${item.path}:\n`;
                // Add partial content that fits the limit
                fileContentsSoFar += '```\n' + decodedContent.slice(0, remain) + '\n```\n';
                totalSizeSoFar += remain;
                // Append cutoff message
                fileContentsSoFar += '\n## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n';
                treeSoFar += '## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n';
                // Break out since we've reached the limit
                break;
              } else {
                fileContentsSoFar += `\n${'    '.repeat(indent)}${item.path}:\n`;
                fileContentsSoFar += '```\n' + decodedContent + '\n```\n';
                totalSizeSoFar += decodedContent.length;
              }
            }
          } catch (error) {
            logger.warn({ error, path: item.path }, 'Error fetching file content');
            fileContentsSoFar += `\n${'    '.repeat(indent)}${item.path}: [Error reading file]\n`;
          }
        } else {
          logger.debug(
            { 
              file: item.name, 
              path: item.path 
            }, 
            'Skipping file due to extension not in whitelist'
          );
        }
      }
    }

    // If we ended the loop due to the limit, append final cutoff if not present
    if (totalSizeSoFar >= MAX_CODEBASE_SIZE && !fileContentsSoFar.endsWith('## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n')) {
      fileContentsSoFar += '\n## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n';
      treeSoFar += '## CODEBASE HAD TO BE CUT OFF HERE DUE TO LENGTH\n';
    }

    // Add metrics summary to the tree
    const metricsSummary = `\n## Codebase Metrics
- Total Characters: ${metrics.totalCharacters.toLocaleString()}
- Total Files Processed: ${metrics.totalFiles}
- Max Size Limit: ${MAX_CODEBASE_SIZE.toLocaleString()} characters
${metrics.totalCharacters >= MAX_CODEBASE_SIZE ? '- ⚠️ CODEBASE EXCEEDED SIZE LIMIT' : ''}`;

    return {
      tree: treeSoFar + metricsSummary,
      contents: fileContentsSoFar,
      totalSize: totalSizeSoFar,
      metrics
    };
  } catch (error) {
    logger.error({ error, path }, 'Failed to fetch GitHub data');

    throw error;
  }
}

/**
 * Main function that returns everything in a single object.
 */
export async function gatherGitHubData(
  githubUrl: string,
  token?: string,
  detailed: boolean = true
): Promise<GitHubData> {
  const { owner, repo } = parseGitHubUrl(githubUrl);

  const authorInfo = await fetchAuthorInfo(owner, token);
  const repoMetadata = await fetchRepoMetadata(owner, repo, token);
  const repoActivity = await fetchRepoActivity(owner, repo, token);

  let codeData: CodeData = {
    directoryTree: '',
    fileContents: '',
    metrics: {
      totalCharacters: 0,
      totalFiles: 0
    }
  };

  // Only fetch code data if detailed analysis is requested
  if (detailed) {
    try {
      const treeResult = await buildDirectoryTree(owner, repo, '', token);
      codeData = {
        directoryTree: treeResult.tree,
        fileContents: treeResult.contents,
        metrics: treeResult.metrics
      };
      
      // Log the metrics
      logger.info({
        totalCharacters: treeResult.metrics.totalCharacters,
        totalFiles: treeResult.metrics.totalFiles,
        sizeLimit: MAX_CODEBASE_SIZE,
        exceeded: treeResult.metrics.totalCharacters >= MAX_CODEBASE_SIZE
      }, 'Codebase metrics collected');
      
    } catch (error) {
      logger.error({ error }, 'Failed to fetch detailed code data');
      codeData = {
        directoryTree: 'Error fetching directory structure',
        fileContents: 'Error fetching file contents',
        metrics: {
          totalCharacters: 0,
          totalFiles: 0
        }
      };
    }
  }

  return {
    authorInfo,
    repoMetadata,
    repoActivity,
    codeData,
  };
}