(() => {
  const status = document.getElementById('copyStatus');
  const clearButton = document.getElementById('clearDemoForm');
  let statusTimer;

  const setStatus = (key) => {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = window.TabbyPasteDocs?.translate(key) || '';
    statusTimer = setTimeout(() => {
      status.textContent = '';
    }, 4000);
  };

  document.querySelectorAll('.copy-row-button').forEach(button => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const values = Array.from(row.querySelectorAll('[data-copy-value]'))
        .map(cell => cell.dataset.copyValue);

      try {
        await navigator.clipboard.writeText(values.join('\t'));
        setStatus('manual.practice.copySuccess');
        document.getElementById('employeeId')?.focus();
      } catch (error) {
        console.error('Failed to copy sample data:', error);
        setStatus('manual.practice.copyError');
      }
    });
  });

  document.getElementById('demoForm')?.addEventListener('submit', event => {
    event.preventDefault();
  });

  clearButton?.addEventListener('click', () => {
    document.getElementById('demoForm')?.reset();
    document.getElementById('employeeId')?.focus();
  });
})();
