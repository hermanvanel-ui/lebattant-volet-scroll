// NAV scroll state — léger
const nav = document.querySelector('.nav');
function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 50); }
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('wheel', onScroll, { passive: true });
window.addEventListener('touchmove', onScroll, { passive: true });
onScroll();
