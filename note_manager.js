/**
 * Note Manager - Handles saving and retrieving notes/command sequences with advanced features
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class NoteManager {
  constructor() {
    this.notesDir = path.join(os.homedir(), '.terminal', 'notes');
    this.tagsDir = path.join(this.notesDir, 'tags'); // Directory for tag metadata
    this.remindersDir = path.join(this.notesDir, 'reminders'); // Directory for reminder data
    this.ensureNotesDir();
  }

  async ensureNotesDir() {
    await fs.mkdir(this.notesDir, { recursive: true });
    await fs.mkdir(this.tagsDir, { recursive: true });
    await fs.mkdir(this.remindersDir, { recursive: true });
  }

  async saveNote(title, content) {
    const notePath = path.join(this.notesDir, `${title}.txt`);
    await fs.writeFile(notePath, content);
    return notePath;
  }

  async saveNoteWithTags(title, tags, content) {
    // Save the note content
    await this.saveNote(title, content);
    
    // Save tag metadata
    const tagsPath = path.join(this.tagsDir, `${title}.json`);
    await fs.writeFile(tagsPath, JSON.stringify({ tags, lastModified: new Date().toISOString() }));
    
    return path.join(this.notesDir, `${title}.txt`);
  }

  async getNote(title) {
    const notePath = path.join(this.notesDir, `${title}.txt`);
    return fs.readFile(notePath, 'utf8');
  }

  async getNoteWithTags(title) {
    const notePath = path.join(this.notesDir, `${title}.txt`);
    const tagsPath = path.join(this.tagsDir, `${title}.json`);
    
    const content = await fs.readFile(notePath, 'utf8');
    let tags = [];
    
    try {
      const tagsData = await fs.readFile(tagsPath, 'utf8');
      tags = JSON.parse(tagsData).tags;
    } catch (error) {
      // Tags file doesn't exist, which is fine
    }
    
    return { content, tags };
  }

  async listNotes() {
    const files = await fs.readdir(this.notesDir);
    return files.filter(file => file.endsWith('.txt')).map(file => file.replace('.txt', ''));
  }

  async listNotesWithTags() {
    const notes = await this.listNotes();
    const notesWithTags = [];
    
    for (const note of notes) {
      const tagsPath = path.join(this.tagsDir, `${note}.json`);
      let tags = [];
      
      try {
        const tagsData = await fs.readFile(tagsPath, 'utf8');
        tags = JSON.parse(tagsData).tags;
      } catch (error) {
        // Tags file doesn't exist, which is fine
      }
      
      notesWithTags.push({ note, tags });
    }
    
    return notesWithTags;
  }

  async searchNotes(query) {
    const notes = await this.listNotes();
    const results = [];
    
    for (const note of notes) {
      const content = await this.getNote(note);
      if (content.includes(query)) {
        results.push({ note, content });
      }
    }
    
    return results;
  }

  async searchNotesByTags(tags) {
    const notes = await this.listNotes();
    const results = [];
    
    for (const note of notes) {
      const tagsPath = path.join(this.tagsDir, `${note}.json`);
      let noteTags = [];
      
      try {
        const tagsData = await fs.readFile(tagsPath, 'utf8');
        noteTags = JSON.parse(tagsData).tags;
      } catch (error) {
        // Tags file doesn't exist, which is fine
      }
      
      // Check if any of the search tags match the note's tags
      if (tags.some(tag => noteTags.includes(tag))) {
        results.push({ note, tags: noteTags });
      }
    }
    
    return results;
  }

  async exportNotes(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const notes = await this.listNotesWithTags();
    const exportData = [];
    
    for (const note of notes) {
      const content = await this.getNote(note.note);
      exportData.push({ title: note.note, tags: note.tags, content });
    }
    
    if (ext === '.json') {
      await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
    } else {
      // Default to plaintext export with clear formatting
      let output = '';
      for (const note of exportData) {
        output += `# ${note.title}\n`;
        if (note.tags.length > 0) {
          output += `Tags: ${note.tags.join(', ')}\n`;
        }
        output += `${note.content}\n\n`;
      }
      await fs.writeFile(filePath, output, 'utf8');
    }
    
    return { count: exportData.length };
  }

  async scheduleNoteReminder(title, reminderTime) {
    const reminderPath = path.join(this.remindersDir, `${title}.json`);
    const reminderData = {
      title,
      reminderTime: reminderTime.toISOString(),
      scheduledAt: new Date().toISOString()
    };
    
    await fs.writeFile(reminderPath, JSON.stringify(reminderData, null, 2));
    return reminderPath;
  }
}

module.exports = NoteManager;