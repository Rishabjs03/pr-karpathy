// Page behavior for the generated explainer. Plain browser JavaScript, no dependencies.
//
// 1. Theme toggle (light/dark), saved in localStorage.
// 2. Flow diagram rendering with Mermaid, with a text fallback.
// 3. Test checklist state, saved in localStorage per pull request.
// 4. Expand/collapse all change cards, and open all cards for printing.
// 5. Highlight the section link for the section in view.
(function () {
  'use strict';

  var root = document.documentElement;
  var dataElement = document.getElementById('lucidiff-data');
  var data = dataElement ? JSON.parse(dataElement.textContent || '{}') : {};

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Storage is optional. The page works without it.
    }
  }

  // ---------------------------------------------------------------------------------------
  // 1. Theme
  // ---------------------------------------------------------------------------------------
  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    var explicit = root.dataset.theme;
    if (explicit === 'light' || explicit === 'dark') return explicit;
    return systemDark.matches ? 'dark' : 'light';
  }

  var toggle = document.querySelector('[data-theme-toggle]');
  function updateToggleLabel() {
    if (!toggle) return;
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    toggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    toggle.setAttribute('title', 'Switch to ' + next + ' theme');
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      storageSet('lucidiff:theme', next);
      updateToggleLabel();
      renderFlow();
    });
  }
  systemDark.addEventListener('change', function () {
    updateToggleLabel();
    if (!root.dataset.theme) renderFlow();
  });
  updateToggleLabel();

  // ---------------------------------------------------------------------------------------
  // 2. Flow diagram
  // ---------------------------------------------------------------------------------------
  var diagram = document.querySelector('[data-flow-diagram]');
  var flowText = document.querySelector('[data-flow-text]');
  var renderCount = 0;

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function showFlowFallback(message) {
    if (!diagram) return;
    diagram.dataset.state = 'failed';
    diagram.removeAttribute('role');
    var status = diagram.querySelector('[data-flow-status]');
    if (status) status.textContent = message;
    if (flowText) flowText.open = true;
  }

  function renderFlow() {
    if (!diagram || !data.mermaid) return;
    if (typeof window.mermaid === 'undefined') return;
    var mermaid = window.mermaid;
    var font = cssVar('--font-sans');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: font,
      flowchart: {
        curve: 'basis',
        padding: 14,
        nodeSpacing: 48,
        rankSpacing: 56,
        wrappingWidth: 180,
      },
      themeVariables: {
        fontFamily: font,
        fontSize: '14px',
        background: cssVar('--surface'),
        primaryColor: cssVar('--flow-node-fill'),
        primaryBorderColor: cssVar('--flow-node-stroke'),
        primaryTextColor: cssVar('--text'),
        secondaryColor: cssVar('--flow-cluster-fill'),
        tertiaryColor: cssVar('--flow-cluster-fill'),
        lineColor: cssVar('--flow-line'),
        textColor: cssVar('--text-muted'),
        clusterBkg: cssVar('--flow-cluster-fill'),
        clusterBorder: cssVar('--border'),
        edgeLabelBackground: cssVar('--surface'),
        titleColor: cssVar('--text-muted'),
      },
    });
    renderCount += 1;
    mermaid
      .render('lucidiff-flow-' + renderCount, data.mermaid)
      .then(function (result) {
        diagram.innerHTML = result.svg;
        diagram.dataset.state = 'ready';
      })
      .catch(function () {
        showFlowFallback('The diagram could not be drawn, so it is shown as text below.');
      });
  }

  if (diagram && data.mermaid) {
    var mermaidScript = document.getElementById('mermaid-script');
    if (typeof window.mermaid !== 'undefined') {
      renderFlow();
    } else if (mermaidScript) {
      mermaidScript.addEventListener('load', renderFlow);
      mermaidScript.addEventListener('error', function () {
        showFlowFallback(
          'Mermaid could not load (are you offline?), so the flow is shown as text below.',
        );
      });
    } else {
      showFlowFallback(
        'This page was generated without Mermaid, so the flow is shown as text below.',
      );
    }
  }

  // ---------------------------------------------------------------------------------------
  // 3. Test checklist
  // ---------------------------------------------------------------------------------------
  var checkboxes = Array.prototype.slice.call(document.querySelectorAll('[data-check-id]'));
  var progressText = document.querySelector('[data-check-progress]');
  var progressBar = document.querySelector('[data-check-bar]');
  var resetButton = document.querySelector('[data-check-reset]');
  var checksKey = 'lucidiff:checks:' + (data.storageKey || location.pathname);

  function loadChecks() {
    try {
      var parsed = JSON.parse(storageGet(checksKey) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function updateProgress() {
    var done = checkboxes.filter(function (box) {
      return box.checked;
    }).length;
    if (progressText) progressText.textContent = done + ' of ' + checkboxes.length + ' done';
    if (progressBar) {
      progressBar.style.width = checkboxes.length ? (done / checkboxes.length) * 100 + '%' : '0';
    }
  }

  function saveChecks() {
    var checked = checkboxes
      .filter(function (box) {
        return box.checked;
      })
      .map(function (box) {
        return box.dataset.checkId;
      });
    storageSet(checksKey, checked.length ? JSON.stringify(checked) : null);
  }

  var saved = loadChecks();
  checkboxes.forEach(function (box) {
    box.checked = saved.indexOf(box.dataset.checkId) !== -1;
    box.addEventListener('change', function () {
      saveChecks();
      updateProgress();
    });
  });
  if (resetButton) {
    resetButton.addEventListener('click', function () {
      checkboxes.forEach(function (box) {
        box.checked = false;
      });
      saveChecks();
      updateProgress();
    });
  }
  updateProgress();

  // ---------------------------------------------------------------------------------------
  // 4. Change cards and printing
  // ---------------------------------------------------------------------------------------
  var cards = Array.prototype.slice.call(document.querySelectorAll('details.change'));
  Array.prototype.forEach.call(document.querySelectorAll('[data-expand]'), function (button) {
    button.addEventListener('click', function () {
      var open = button.dataset.expand === 'all';
      cards.forEach(function (card) {
        card.open = open;
      });
    });
  });

  var openBeforePrint = [];
  window.addEventListener('beforeprint', function () {
    openBeforePrint = Array.prototype.slice.call(document.querySelectorAll('details'));
    openBeforePrint = openBeforePrint.map(function (element) {
      var wasOpen = element.open;
      element.open = true;
      return { element: element, wasOpen: wasOpen };
    });
  });
  window.addEventListener('afterprint', function () {
    openBeforePrint.forEach(function (entry) {
      entry.element.open = entry.wasOpen;
    });
  });

  // ---------------------------------------------------------------------------------------
  // 5. Active section in the top bar
  // ---------------------------------------------------------------------------------------
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  if ('IntersectionObserver' in window && navLinks.length) {
    var visible = {};
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.id] = entry.isIntersecting;
        });
        var active = null;
        for (var index = 0; index < navLinks.length; index += 1) {
          if (visible[navLinks[index].dataset.nav]) {
            active = navLinks[index];
            break;
          }
        }
        navLinks.forEach(function (link) {
          if (link === active) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      },
      { rootMargin: '-64px 0px -55% 0px' },
    );
    navLinks.forEach(function (link) {
      var section = document.getElementById(link.dataset.nav);
      if (section) observer.observe(section);
    });
  }
})();
