/**
 * Note Manager - Handles saving and retrieving notes/command sequences
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class NoteManager {
  constructor() {
    this.notesDir = path.join(os.homedir(), '.terminal', 'notes');
    this.ensureNotesDir();
  }

  async ensureNotesDir() {
    await fs.mkdir(this.notesDir, { recursive: true });
  }

  async saveNote(title, content) {
    const notePath = path.join(this.notesDir, `${title}.txt`);
    await fs.writeFile(notePath, content);
    return notePath;
  }

  async getNote(title) {
    const notePath = path.join(this.notesDir, `${title}.txt`);
    return fs.readFile(notePath, 'utf8');
  }

  async listNotes() {
    const files = await fs.readdir(this.notesDir);
    return files.filter(file => file.endsWith('.txt')).map(file => file.replace('.txt', ''));
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
}

module.exports = NoteManager;