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
      }
    ];
  }
  
  initialize(terminal) {
    this.terminal = terminal;
  }
}

module.exports = NotePlugin;