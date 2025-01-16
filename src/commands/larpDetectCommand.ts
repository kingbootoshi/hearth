import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    ColorResolvable
  } from 'discord.js';
  import { gatherGitHubData } from '../modules/larpDetectModule/util/getGithubData';
  import { detectLarp } from '../modules/larpDetectModule/larpDetectModule';
  import { createModuleLogger } from '../utils/logger';
  
  const logger = createModuleLogger('larpDetectCommand');
  
  // Create the slash command builder
  export const data = new SlashCommandBuilder()
    .setName('larpdetect')
    .setDescription('Analyze a GitHub repository for potential LARP characteristics')
    .addStringOption(option =>
      option
        .setName('analysis_type')
        .setDescription('Choose analysis depth')
        .setRequired(true)
        .addChoices(
          { 
            name: '🔎 Light (Quick metadata analysis, quickly analyzes the author and repo data)',
            value: 'light'
          },
          { 
            name: '🔬 Heavy (Analyzes everything including the FULL codebase, may timeout on large repos)',
            value: 'heavy' 
          }
        ))
    .addStringOption(option =>
      option
        .setName('github_url')
        .setDescription('The URL of the GitHub repository to analyze')
        .setRequired(true));
  
  // Helper function to create color based on authenticity score
  function getScoreColor(score: number): ColorResolvable {
    if (score >= 80) return '#00FF00'; // Green for high scores
    if (score >= 50) return '#FFA500'; // Orange for medium scores
    return '#FF0000'; // Red for low scores
  }
  
  // Execute function for the command
  export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer reply since this might take a while
    await interaction.deferReply();
  
    let larpAnalysis: any = null;
  
    try {
      const analysisType = interaction.options.getString('analysis_type', true);
      const githubUrl = interaction.options.getString('github_url', true);
      const detailed = analysisType === 'heavy';
      
      logger.info({ githubUrl, analysisType }, 'Analyzing GitHub repository');
  
      // Add an initial reply to inform the user about the analysis type
      await interaction.editReply({
        content: detailed 
          ? '🔬 Performing detailed analysis of the repository (this may take a while)...'
          : '🔎 Performing quick analysis of the repository...'
      });
  
      // Gather GitHub data with detailed flag
      const githubData = await gatherGitHubData(githubUrl, process.env.GITHUB_TOKEN, detailed);
      logger.debug({ githubData }, 'GitHub data gathered');
  
      // Build markdown content for analysis
      const markdownContent = `# GitHub Repository Analysis
  
  ## Author Information
  - Username: ${githubData.authorInfo.login}
  - Profile: ${githubData.authorInfo.htmlUrl}
  - Public Repositories: ${githubData.authorInfo.publicRepos}
  - Account Created: ${new Date(githubData.authorInfo.createdAt).toLocaleDateString()}
  
  ## Repository Metadata
  - Name: ${githubData.repoMetadata.fullName}
  - Description: ${githubData.repoMetadata.description}
  - Stars: ${githubData.repoMetadata.stars}
  - Forks: ${githubData.repoMetadata.forks}
  - Watchers: ${githubData.repoMetadata.watchers}
  - Open Issues: ${githubData.repoMetadata.openIssues}
  - Default Branch: ${githubData.repoMetadata.defaultBranch}
  - Created: ${new Date(githubData.repoMetadata.createdAt).toLocaleDateString()}
  - Is Fork: ${githubData.repoMetadata.isFork ? 'Yes' : 'No'}
  ${githubData.repoMetadata.isFork 
    ? `- Original Repo: ${githubData.repoMetadata.parentFullName} (${githubData.repoMetadata.parentHtmlUrl})`
    : ''}
  
  ## Repository Activity
  - Total Commits: ${githubData.repoActivity.totalCommits}
  - Contributors: ${githubData.repoActivity.contributorsCount}
  - Open Pull Requests: ${githubData.repoActivity.openPullRequests}
  
  ${detailed ? `## Repository Structure
  \`\`\`
  ${githubData.codeData?.directoryTree || 'Not available'}
  \`\`\`
  
  ## File Contents
  \`\`\`
  ${githubData.codeData?.fileContents || 'Not available'}
  \`\`\`` : ''}`;
  
      // Add environment variable for GitHub token
      const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
      // Get LARP analysis from the module
      larpAnalysis = await detectLarp([
        {
          role: "user",
          content: `CURRENT DATE: ${new Date().toLocaleString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            timeZone: 'UTC',
            hour12: true
          })} UTC\n\nANALYZE THE FOLLOWING GITHUB REPO:\n\n${markdownContent}`
        }
      ], GITHUB_TOKEN);
      logger.debug({ larpAnalysis }, 'LARP analysis completed');
  
      // Create embeds for the response
      const mainEmbed = new EmbedBuilder()
        .setTitle(`🔍 Repository Analysis: ${githubData.repoMetadata.fullName}`)
        .setColor(getScoreColor(larpAnalysis.authenticity_score))
        .setDescription(larpAnalysis.thought_process)
        .addFields(
          { 
            name: '📊 Authenticity Score', 
            value: `${larpAnalysis.authenticity_score}/100`,
            inline: true 
          },
          { 
            name: '🎭 LARP Status', 
            value: larpAnalysis.is_fake ? '❌ FAKE' : '✅ LEGITIMATE',
            inline: true 
          }
        )
        .setTimestamp();
  
      // Add repository info
      const repoInfoEmbed = new EmbedBuilder()
        .setTitle('📚 Repository Information')
        .setColor(getScoreColor(larpAnalysis.authenticity_score))
        .addFields(
          { 
            name: '👤 Author', 
            value: `[${githubData.authorInfo.login}](${githubData.authorInfo.htmlUrl})`,
            inline: true 
          },
          { 
            name: '⭐ Stars', 
            value: githubData.repoMetadata.stars.toString(),
            inline: true 
          },
          { 
            name: '🔄 Forks', 
            value: githubData.repoMetadata.forks.toString(),
            inline: true 
          },
          {
            name: '📝 Commits',
            value: githubData.repoActivity.totalCommits.toString(),
            inline: true
          },
          {
            name: '👥 Contributors',
            value: githubData.repoActivity.contributorsCount.toString(),
            inline: true
          },
          {
            name: '📅 Created',
            value: new Date(githubData.repoMetadata.createdAt).toLocaleDateString(),
            inline: true
          },
          {
            name: '🔀 Fork Status',
            value: githubData.repoMetadata.isFork ? 'Yes' : 'No',
            inline: true
          }
        );
  
      // Add original repo field if it's a fork
      if (githubData.repoMetadata.isFork) {
        repoInfoEmbed.addFields({
          name: '📦 Original Repository',
          value: `[${githubData.repoMetadata.parentFullName}](${githubData.repoMetadata.parentHtmlUrl})`,
          inline: false
        });
      }
  
      // Add analysis details
      const analysisEmbed = new EmbedBuilder()
        .setTitle('🔬 Detailed Analysis')
        .setColor(getScoreColor(larpAnalysis.authenticity_score));
  
      // Add notable features if any
      if (larpAnalysis.notable_features) {
        const features = typeof larpAnalysis.notable_features === 'string' 
          ? larpAnalysis.notable_features.split('\n')
          : Array.isArray(larpAnalysis.notable_features) 
            ? larpAnalysis.notable_features 
            : [];
  
        if (features.length > 0) {
          analysisEmbed.addFields({
            name: '✨ Notable Features',
            value: features.map((f: string) => f.trim().startsWith('•') ? f.trim() : `• ${f.trim()}`).join('\n')
          });
        }
      }
  
      // Add suspicious characteristics if any
      if (larpAnalysis.suspicious_characteristics) {
        const suspicious = typeof larpAnalysis.suspicious_characteristics === 'string'
          ? larpAnalysis.suspicious_characteristics.split('\n')
          : Array.isArray(larpAnalysis.suspicious_characteristics)
            ? larpAnalysis.suspicious_characteristics
            : [];
  
        if (suspicious.length > 0) {
          analysisEmbed.addFields({
            name: '⚠️ Suspicious Characteristics',
            value: suspicious.map((s: string) => s.trim().startsWith('•') ? s.trim() : `• ${s.trim()}`).join('\n')
          });
        }
      }
  
      // Add potential issues if any
      if (larpAnalysis.potential_issues) {
        const issues = typeof larpAnalysis.potential_issues === 'string'
          ? larpAnalysis.potential_issues.split('\n')
          : Array.isArray(larpAnalysis.potential_issues)
            ? larpAnalysis.potential_issues
            : [];
  
        if (issues.length > 0) {
          analysisEmbed.addFields({
            name: '❗ Potential Issues',
            value: issues.map((i: string) => i.trim().startsWith('•') ? i.trim() : `• ${i.trim()}`).join('\n')
          });
        }
      }
  
      // Send the response with all embeds
      await interaction.editReply({ 
        embeds: [mainEmbed, repoInfoEmbed, analysisEmbed]
      });
  
      logger.info('LARP detection analysis completed and sent');
    } catch (error) {
      logger.error({ 
        error, 
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Error in LARP detection command');
  
      try {
        // Check if the interaction can still be replied to
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'An error occurred while analyzing the repository. Please make sure the GitHub URL is valid and try again.'
          });
        }
      } catch (replyError) {
        logger.error({ replyError }, 'Failed to send error message to user');
      }
    }
  }