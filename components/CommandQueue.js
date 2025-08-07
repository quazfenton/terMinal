/**
 * CommandQueue Component
 *
 * Renders the command queue and handles interactions with it.
 */
export default class CommandQueue {
  constructor(elementId, onExecute) {
    this.element = document.getElementById(elementId);
    this.onExecute = onExecute;
    this.element.addEventListener('click', this.handleClick.bind(this));
  }

  render(sequences) {
    this.element.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'queue-title';
    title.textContent = 'COMMAND QUEUE';
    this.element.appendChild(title);

    sequences.sort((a, b) => a.rank - b.rank);

    sequences.forEach(sequence => {
      const item = document.createElement('div');
      item.className = 'command-item fade-in';
      item.dataset.sequenceId = sequence.id;

      const rank = document.createElement('div');
      rank.className = 'command-rank';
      rank.textContent = `#${sequence.rank}`;
      item.appendChild(rank);

      sequence.commands.forEach((cmd, index) => {
        const command = typeof cmd === 'string' ? cmd : cmd.command;
        const cmdText = document.createElement('div');
        cmdText.className = 'command-text';
        cmdText.textContent = command;
        item.appendChild(cmdText);

        if (index < sequence.commands.length - 1) {
          const separator = document.createElement('div');
          separator.style.color = '#666';
          separator.style.fontSize = '10px';
          separator.style.margin = '2px 0';
          separator.textContent = '↓';
          item.appendChild(separator);
        }
      });

      if (sequence.description) {
        const description = document.createElement('div');
        description.className = 'command-description';
        description.textContent = sequence.description;
        item.appendChild(description);
      }

      this.element.appendChild(item);
    });
  }

  handleClick(event) {
    const commandItem = event.target.closest('.command-item');
    if (commandItem) {
      const sequenceId = commandItem.dataset.sequenceId;
      this.onExecute(sequenceId);
    }
  }
}