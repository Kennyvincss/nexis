/* =====================================================================
   NOTIFICATIONS SERVICE
   Only real events create notifications: confirmed/failed transactions,
   tracked-trader activity, price moves and resolutions on markets you hold,
   and goals in games you follow. Optional browser (desktop) notifications.
   ===================================================================== */
const Notify = {
  push({ kind, icon = 'bell', text, href = '', toast: showToast = false, toastKind = 'info', setting, title }) {
    if (!Store.s) return;
    if (setting && Store.s.settings[setting] === false) return;
    const n = { id: uid('n'), kind, icon, text, href, t: now(), unread: true };
    Store.s.notifs.unshift(n); Store.s.notifs = Store.s.notifs.slice(0, 150); Store.save(); Bus.emit('notifs');
    const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    if (showToast) toast({ title: title || plain.slice(0, 90), body: title ? esc(plain) : '', kind: toastKind, action: href ? { label: 'Open', href } : undefined });
    if (document.hidden && Store.s.settings.desktop && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title || 'Nexis', { body: plain.slice(0, 180), tag: n.id }); } catch (e) {} }
    return n;
  },
  unread() { return Store.s ? Store.s.notifs.filter(n => n.unread).length : 0; },
  readAll() { Store.s.notifs.forEach(n => n.unread = false); Store.save(); Bus.emit('notifs'); },
  read(id) { const n = Store.s.notifs.find(x => x.id === id); if (n && n.unread) { n.unread = false; Store.save(); Bus.emit('notifs'); } },
  async enableDesktop() {
    if (!('Notification' in window)) return toast({ title: 'Desktop notifications aren’t supported in this browser', kind: 'warn' });
    const p = await Notification.requestPermission(); Store.s.settings.desktop = p === 'granted'; Store.save();
    toast({ title: p === 'granted' ? 'Desktop notifications on' : 'Permission not granted', kind: p === 'granted' ? 'ok' : 'warn' });
  },
};
const notifRows = (list) => list.map(n => `<a class="notif ${n.unread ? 'unread' : ''}" href="${n.href || '#/notifications'}" data-action="readNotif" data-id="${n.id}"><span class="ni">${ic(n.icon || 'bell', 'sm')}</span><p>${n.text}</p><span class="when">${ago(n.t)}</span></a>`).join('');
