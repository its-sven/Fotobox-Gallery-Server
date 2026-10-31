// "Neuestes Bild": regelmäßig neu laden – aber nicht, während jemand den PIN eintippt.
setInterval(() => {
  const pin = document.querySelector('input[name=pin]');
  if (document.hidden || (pin && (pin.value || document.activeElement === pin))) return;
  location.reload();
}, 15000);
