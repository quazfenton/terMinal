/**
 * Input Component
 *
 * Handles user input and related events.
 */
export default class Input {
  constructor(elementId, onProcess) {
    this.element = document.getElementById(elementId);
    this.sendButton = document.getElementById('sendButton');
    this.onProcess = onProcess;

    this.sendButton.addEventListener('click', () => this.process());
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.process();
      }
    });
  }

  process() {
    const value = this.element.value.trim();
    if (value) {
      this.onProcess(value);
      this.element.value = '';
    }
  }

  enable() {
    this.element.disabled = false;
    this.sendButton.disabled = false;
  }

  disable() {
    this.element.disabled = true;
    this.sendButton.disabled = true;
  }
}