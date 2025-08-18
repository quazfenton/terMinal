/**
 * Note Plugin - Manages notes and command sequences
 */
const NoteManager = require('../note_manager');

class NotePlugin {
  constructor() {
    this.noteManager = new NoteManager();
  }

  getName() { return "Note Plugin"; }
  
  getCommands() {
    return [
      {
        name: "note-save",
        description: "Save a note with title and content",
        pattern: /^note save (\S+) (.+)$/i,
        execute: async (match) => {
          const title = match[1];
          const content = match[2];
          await this.noteManager.saveNote(title, content);
          return `Note "${title}" saved`;
        }
      },
      {
        name: "note-save-with-tags",
        description: "Save a note with title, tags, and content",
        pattern: /^note save (\S+) tags=(\S+) (.+)$/i,
        execute: async (match) => {
          const title = match[1];
          const tags = match[2].split(',');
          const content = match[3];
          await this.noteManager.saveNoteWithTags(title, tags, content);
          return `Note "${title}" saved with tags: ${tags.join(', ')}`;
        }
      },
      {
        name: "note-show",
        description: "Show note content",
        pattern: /^note show (\S+)$/i,
        execute: async (match) => {
          const title = match[1];
          return this.noteManager.getNote(title);
        }
      },
      {
        name: "note-run",
        description: "Run commands from a note",
        pattern: /^note run (\S+)$/i,
        execute: async (match, terminal) => {
          const title = match[1];
          const content = await this.noteManager.getNote(title);
          const commands = content.split('\n').filter(cmd => cmd.trim());
          
          let output = '';
          for (const command of commands) {
            const result = await terminal.executeCommand(command);
            output += `$ ${command}\n${result.output}\n`;
          }
          
          return output;
        }
      },
      {
        name: "note-search",
        description: "Search notes by content",
        pattern: /^note search (.+)$/i,
        execute: async (match) => {
          const query = match[1];
          const results = await this.noteManager.searchNotes(query);
          return results.map(r => `${r.note}:\n${r.content.slice(0, 100)}...`).join('\n\n');
        }
      },
      {
        name: "note-search-tags",
        description: "Search notes by tags",
        pattern: /^note search tags=(\S+)$/i,
        execute: async (match) => {
          const tags = match[1].split(',');
          const results = await this.noteManager.searchNotesByTags(tags);
          if (results.length === 0) {
            return `No notes found with tags: ${tags.join(', ')}`;
          }
          return results.map(r => `${r.note} (tags: ${r.tags.join(', ')})`).join('\n');
        }
      },
      {
        name: "note-list",
        description: "List all notes with their tags",
        pattern: /^note list$/i,
        execute: async () => {
          const notes = await this.noteManager.listNotesWithTags();
          if (notes.length === 0) {
            return "No notes found.";
          }
          return notes.map(n => `${n.note} (tags: ${n.tags.join(', ') || 'none'})`).join('\n');
        }
      },
      {
        name: "note-export",
        description: "Export all notes to a file (JSON or txt)",
        pattern: /^note export to (.+)$/i,
        execute: async (match) => {
          const filePath = match[1];
          const exportData = await this.noteManager.exportNotes(filePath);
          return `Exported ${exportData.count} notes to ${filePath}`;
        }
      },
      {
        name: "note-schedule",
        description: "Schedule a reminder for a note",
        pattern: /^note schedule (\S+) (.+)$/i,
        execute: async (match, terminal) => {
          const title = match[1];
          const timeExpression = match[2];
          const reminderTime = this.parseTimeExpression(timeExpression);
          if (!reminderTime) {
            return "Invalid time expression. Use formats like 'in 5 minutes', 'at 14:30', or 'tomorrow at 9am'.";
          }
          
          await this.noteManager.scheduleNoteReminder(title, reminderTime);
          return `Scheduled reminder for note "${title}" at ${reminderTime.toLocaleString()}`;
        }
      }
    ];
  }
  
  initialize(terminal) {
    this.terminal = terminal;
  }
  
  parseTimeExpression(expression) {
    const now = new Date();
    
    // Handle "in X minutes/hours/days"
    const inMatch = expression.match(/^in (\d+) (minute|minutes|hour|hours|day|days)$/);
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      
      const reminderTime = new Date(now);
      switch (unit) {
        case 'minute':
        case 'minutes':
          reminderTime.setMinutes(reminderTime.getMinutes() + amount);
          break;
        case 'hour':
        case 'hours':
          reminderTime.setHours(reminderTime.getHours() + amount);
          break;
        case 'day':
        case 'days':
          reminderTime.setDate(reminderTime.getDate() + amount);
          break;
      }
      return reminderTime;
    }
    
    // Handle "at HH:MM"
    const atMatch = expression.match(/^at (\d{1,2}):(\d{2})$/);
    if (atMatch) {
      const hours = parseInt(atMatch[1]);
      const minutes = parseInt(atMatch[2]);
      
      const reminderTime = new Date(now);
      reminderTime.setHours(hours, minutes, 0, 0);
      
      // If the time is in the past, schedule for tomorrow
      if (reminderTime < now) {
        reminderTime.setDate(reminderTime.getDate() + 1);
      }
      
      return reminderTime;
    }
    
    // Handle "tomorrow at HH:MM"
    const tomorrowMatch = expression.match(/^tomorrow at (\d{1,2}):?(\d{2})?(am|pm)?$/);
    if (tomorrowMatch) {
      const hours = parseInt(tomorrowMatch[1]);
      const minutes = parseInt(tomorrowMatch[2] || 0);
      const period = tomorrowMatch[3];
      
      let adjustedHours = hours;
      if (period === 'pm' && hours < 12) {
        adjustedHours += 12;
      } else if (period === 'am' && hours === 12) {
        adjustedHours = 0;
      }
      
      const reminderTime = new Date(now);
      reminderTime.setDate(reminderTime.getDate() + 1);
      reminderTime.setHours(adjustedHours, minutes, 0, 0);
      
      return reminderTime;
    }
    
    return null;
  }
}

module.exports = NotePlugin;