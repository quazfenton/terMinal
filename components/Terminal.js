/**
 * Terminal Component
 *
 * Renders the terminal output area and handles terminal-related UI logic.
 */
export default class Terminal {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
  }

  addLog(text, type = 'output') {
    const line = document.createElement('div');
    line.className = `terminal-line fade-in`;

    const prompt = document.createElement('span');
    prompt.className = 'terminal-prompt';

    const content = document.createElement('span');
    content.className = 'terminal-content';

    switch (type) {
      case 'user':
        prompt.textContent = '> ';
        content.textContent = text;
        break;
      case 'system':
        prompt.textContent = '# ';
        content.textContent = text;
        break;
      case 'command':
        prompt.textContent = '$ ';
        content.textContent = text;
        break;
      case 'error':
        prompt.textContent = '! ';
        content.className += ' terminal-error';
        content.textContent = text;
        break;
      default:
        prompt.textContent = '';
        content.textContent = text;
    }

    line.appendChild(prompt);
    line.appendChild(content);
    this.element.appendChild(line);
    this.element.scrollTop = this.element.scrollHeight;
  }

  clear() {
    this.element.innerHTML = '';
    this.addLog('Terminal cleared.', 'system');
  }
}