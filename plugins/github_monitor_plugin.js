
const axios = require('axios');
const sqlite3 = require('sqlite3');
const path = require('path');

class GitHubMonitorPlugin {
  constructor(config = {}) {
    this.dbPath = path.join(__dirname, '..', 'github_repos.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.githubToken = process.env.GITHUB_TOKEN || config.githubToken; // For higher rate limits
    this.initDatabase();
  }

  initDatabase() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS repositories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo_name TEXT UNIQUE,
          description TEXT,
          stars INTEGER,
          forks INTEGER,
          open_issues INTEGER,
          last_push TEXT,
          last_checked TEXT
        )
      `);
    });
  }

  getCommands() {
    return [
      {
        command: /^monitor repo ([-_a-zA-Z0-9\/]+)/,
        handler: this.monitorRepoCommand.bind(this),
        description: 'Adds a GitHub repository to the monitor list.',
        args: ['repo_name']
      },
      {
        command: /^unmonitor repo ([-_a-zA-Z0-9\/]+)/,
        handler: this.unmonitorRepoCommand.bind(this),
        description: 'Removes a GitHub repository from the monitor list.',
        args: ['repo_name']
      },
      {
        command: /^check repos$/,
        handler: this.checkReposCommand.bind(this),
        description: 'Checks all monitored repositories for updates.'
      },
      {
        command: /^list monitored repos$/,
        handler: this.listMonitoredReposCommand.bind(this),
        description: 'Lists all monitored repositories.'
      }
    ];
  }

  async monitorRepoCommand(match) {
    const [, repoName] = match;
    try {
      const repoData = await this.fetchRepoData(repoName);
      if (!repoData) {
        return { success: false, output: `Could not fetch data for repo: ${repoName}` };
      }

      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT OR REPLACE INTO repositories \n           (repo_name, description, stars, forks, open_issues, last_push, last_checked)\n           VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [
            repoData.full_name,
            repoData.description,
            repoData.stargazers_count,
            repoData.forks_count,
            repoData.open_issues_count,
            repoData.pushed_at,
            new Date().toISOString()
          ],
          (err) => {
            if (err) reject(err); else resolve();
          }
        );
      });

      return { success: true, output: `Successfully added "${repoName}" to the monitor list.` };
    } catch (error) {
      return { success: false, output: `Failed to monitor repo: ${error.message}` };
    }
  }

  async unmonitorRepoCommand(match) {
    const [, repoName] = match;
    try {
      const result = await new Promise((resolve, reject) => {
        this.db.run('DELETE FROM repositories WHERE repo_name = ?', [repoName], function(err) {
          if (err) reject(err); else resolve(this.changes);
        });
      });

      if (result > 0) {
        return { success: true, output: `Successfully removed "${repoName}" from the monitor list.` };
      } else {
        return { success: false, output: `Repo "${repoName}" was not on the monitor list.` };
      }
    } catch (error) {
      return { success: false, output: `Failed to unmonitor repo: ${error.message}` };
    }
  }

  async checkReposCommand() {
    const repos = await new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM repositories', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (repos.length === 0) {
      return { success: true, output: 'No repositories to check. Add one with `monitor repo <user/repo>`' };
    }

    let changesLog = [];
    for (const oldData of repos) {
      try {
        const newData = await this.fetchRepoData(oldData.repo_name);
        if (!newData) continue;

        const changes = this.compareRepoData(oldData, newData);
        if (changes.length > 0) {
          changesLog.push(`Changes for ${newData.full_name}:\n` + changes.join('\n'));
          this.updateRepoData(newData);
        }
      } catch (error) {
        changesLog.push(`Could not check repo ${oldData.repo_name}: ${error.message}`);
      }
    }

    if (changesLog.length === 0) {
      return { success: true, output: 'Checked all repositories. No changes detected.' };
    }

    return { success: true, output: changesLog.join('\n\n') };
  }

  async listMonitoredReposCommand() {
    const repos = await new Promise((resolve, reject) => {
      this.db.all('SELECT repo_name, stars, forks, last_push FROM repositories ORDER BY repo_name', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    if (repos.length === 0) {
      return { success: true, output: 'No repositories are being monitored.' };
    }

    const output = repos.map(r => 
      `${r.repo_name} (★ ${r.stars} | 🍴 ${r.forks} | 📤 ${new Date(r.last_push).toLocaleDateString()})`
    ).join('\n');
    return { success: true, output };
  }

  async fetchRepoData(repoName) {
    try {
      const url = `https://api.github.com/repos/${repoName}`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (this.githubToken) {
        headers.Authorization = `token ${this.githubToken}`;
      }
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch GitHub repo ${repoName}:`, error.message);
      return null;
    }
  }

  compareRepoData(oldData, newData) {
    const changes = [];
    if (oldData.stars !== newData.stargazers_count) {
      changes.push(`  - Stars: ${oldData.stars} -> ${newData.stargazers_count}`);
    }
    if (oldData.forks !== newData.forks_count) {
      changes.push(`  - Forks: ${oldData.forks} -> ${newData.forks_count}`);
    }
    if (oldData.open_issues !== newData.open_issues_count) {
      changes.push(`  - Open Issues: ${oldData.open_issues} -> ${newData.open_issues_count}`);
    }
    if (oldData.last_push !== newData.pushed_at) {
      changes.push(`  - Last Push: ${new Date(oldData.last_push).toLocaleString()} -> ${new Date(newData.pushed_at).toLocaleString()}`);
    }
    return changes;
  }

  updateRepoData(newData) {
    this.db.run(
      `UPDATE repositories SET \n       description = ?, stars = ?, forks = ?, open_issues = ?, last_push = ?, last_checked = ?\n       WHERE repo_name = ?`,
      [
        newData.description,
        newData.stargazers_count,
        newData.forks_count,
        newData.open_issues_count,
        newData.pushed_at,
        new Date().toISOString(),
        newData.full_name
      ]
    );
  }
}

module.exports = GitHubMonitorPlugin;
