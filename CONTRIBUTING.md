# Contributing to MathAI

First off, thank you for considering contributing to MathAI! 🎉

It's people like you that make MathAI such a great tool for students and educators worldwide.

## 🌟 Welcome!

MathAI is an open-source AI-powered math solver that helps students visualize and understand mathematical concepts. We welcome contributions of all kinds:

- 🐛 Bug reports and fixes
- ✨ New features
- 📝 Documentation improvements
- 🎨 UI/UX enhancements
- 🧪 Tests
- 💡 Ideas and suggestions

## 🚀 Quick Start

### 1. Fork & Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR-USERNAME/mathAI.git
cd mathAI
```

### 2. Setup Development Environment

```bash
# Install Vercel CLI (for local dev with serverless functions)
npm install -g vercel

# Run local development server
vercel dev
```

The app will be available at `http://localhost:3000`

### 3. Make Your Changes

- Create a new branch: `git checkout -b feature/your-feature-name`
- Make your changes
- Test thoroughly
- Commit with clear messages: `git commit -m "Add: new visualization feature"`

### 4. Submit a Pull Request

- Push to your fork: `git push origin feature/your-feature-name`
- Open a Pull Request on GitHub
- Describe your changes clearly
- Link any related issues

## 📋 How Can I Contribute?

### 🐛 Reporting Bugs

**Before submitting a bug report:**
- Check the [existing issues](https://github.com/YOUR-REPO/issues)
- Try the latest version at [https://mathai.siddikhamim.com](https://mathai.siddikhamim.com)
- Check if it's already fixed in the repo

**When submitting a bug report, include:**
- Clear title and description
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/GIFs if applicable
- Browser and OS version
- Console errors (F12 → Console tab)

**Use this template:**
```markdown
## Bug Description
[Clear description]

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Screenshots
[If applicable]

## Environment
- Browser: [e.g., Chrome 120]
- OS: [e.g., macOS 14, Windows 11]
- Device: [e.g., Desktop, iPhone 13]

## Console Errors
```
[Paste any console errors]
```
```

### ✨ Suggesting Features

We love new ideas! Before suggesting:
- Check if it's already suggested in [issues](https://github.com/YOUR-REPO/issues)
- Think about how it fits with the project's goals

**Feature request template:**
```markdown
## Feature Description
[Clear description of the feature]

## Problem It Solves
[What problem does this address?]

## Proposed Solution
[How would this work?]

## Alternatives Considered
[Other ways to solve this]

## Additional Context
[Screenshots, mockups, examples]
```

### 🏷️ Good First Issues

New to the project? Look for issues tagged with:
- `good-first-issue` - Great for beginners
- `help-wanted` - We need community help
- `documentation` - Docs improvements

**Current good first issues:**
- Add keyboard shortcuts (Ctrl+S to solve)
- Improve error messages
- Add loading states
- Mobile responsive improvements
- Accessibility enhancements (ARIA labels)
- Add more example images
- Create video tutorials

## 🛠️ Development Guidelines

### Code Style

**JavaScript**
- Use ES6+ features (const/let, arrow functions, async/await)
- Vanilla JavaScript only - no frameworks
- Keep functions small and focused
- Add comments for complex logic
- Use meaningful variable names

```javascript
// Good ✅
async function fetchSolution(imageData) {
  try {
    const response = await aiProvider.solve(imageData);
    return response;
  } catch (error) {
    console.error('Failed to fetch solution:', error);
    throw error;
  }
}

// Avoid ❌
async function f(d) {
  return await x(d);
}
```

**File Organization**
```
js/
├── config.js         // Configuration and constants
├── state.js          // Global state management
├── dom.js            // DOM element references
├── main.js           // Entry point, event listeners
├── ai-service.js     // AI provider integrations
├── chat-engine.js    // Chat and solving logic
├── visualization.js  // Visualization engines
├── renderer.js       // Markdown and LaTeX rendering
├── file-handler.js   // File upload and PDF handling
├── selection.js      // Selection rectangle logic
├── settings.js       // Settings modal logic
├── carousel.js       // Model switcher UI
├── exporter.js       // PDF export functionality
├── mobile.js         // Mobile-specific features
├── ui-manager.js     // UI utilities
├── theme.js          // Dark/light mode
└── utils.js          // Helper functions
```

**CSS**
- Use CSS variables for theming
- Mobile-first approach
- Follow existing naming conventions
- Keep selectors specific but not overly nested

**HTML**
- Semantic HTML5
- Accessible (proper labels, ARIA attributes)
- Valid markup

### Architecture Principles

1. **Modular ES6**: Each file is a module with clear responsibilities
2. **No frameworks**: Keep it vanilla JavaScript
3. **Privacy-first**: Everything runs client-side
4. **Progressive enhancement**: Basic functionality works everywhere
5. **Responsive**: Works on mobile, tablet, desktop

### Testing

Currently, we don't have automated tests (help wanted!). When making changes:

**Manual testing checklist:**
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile (iOS and Android)
- [ ] Test dark and light modes
- [ ] Test with different AI providers
- [ ] Test all three visualization engines
- [ ] Test PDF upload and navigation
- [ ] Test image upload
- [ ] Test selection rectangle (draw, move, resize)
- [ ] Test chat functionality
- [ ] Check console for errors
- [ ] Test with slow network (throttle in DevTools)

### Commit Messages

Use clear, descriptive commit messages:

```
Add: New feature
Fix: Bug description
Update: Existing feature modification
Refactor: Code restructuring
Docs: Documentation changes
Style: Formatting, missing semicolons, etc.
Test: Adding tests
Chore: Maintenance tasks
```

**Examples:**
```
Add: Direct SVG visualization engine
Fix: TikZ code extraction failing on certain formats
Update: Improve error messages for failed API calls
Docs: Add troubleshooting section to README
Refactor: Extract visualization logic into separate modules
```

## 🎨 Working on Features

### Adding a New AI Provider

1. **Update `js/config.js`**:
```javascript
export const AVAILABLE_MODELS = {
  // ... existing providers
  newprovider: [
    { id: "model-1", label: "Model 1" },
    { id: "model-2", label: "Model 2" }
  ]
};
```

2. **Add API integration in `js/ai-service.js`**:
```javascript
export async function callNewProviderChat(messages, apiKey, model, onChunk) {
  // Implementation
}
```

3. **Update `js/chat-engine.js`** to use the new provider

4. **Add settings UI in `index.html`**

5. **Update documentation**

### Adding a New Visualization Engine

1. **Add option in `index.html`** (Visualization Settings)

2. **Update `js/state.js`**:
```javascript
visEngine: "tikz", // add your engine name
```

3. **Add DOM reference in `js/dom.js`**

4. **Implement in `js/visualization.js`**:
```javascript
} else if (state.visEngine === "your-engine") {
  // Your implementation
}
```

5. **Update documentation with comparison**

### Improving Visualization Extraction

The extraction logic is in `js/visualization.js`. Key areas:
- TikZ extraction (lines ~230-260)
- SVG extraction (lines ~380-410)
- Matplotlib extraction (lines ~470-490)

**When improving:**
- Add more fallback strategies
- Handle edge cases
- Log failures for debugging
- Update error messages

## 🔍 Code Review Process

All submissions require review. We look for:

1. **Functionality**: Does it work as intended?
2. **Code quality**: Is it clean, readable, maintainable?
3. **Performance**: Does it slow down the app?
4. **Compatibility**: Works across browsers?
5. **Documentation**: Updated relevant docs?
6. **No breaking changes**: Unless discussed first

**Review timeline:**
- Simple fixes: 1-2 days
- Features: 3-7 days
- Major changes: May require discussion first

## 📚 Resources

### Project Documentation
- [README](./README.md) - Project overview
- [Quick Start Guide](./docs/QUICK_START.md) - Setup instructions
- [Direct SVG Feature](./docs/DIRECT_SVG_VISUALIZATION.md) - SVG visualization details
- [Agent Instructions](./AGENTS.md) - Architecture guidance

### Learning Resources
- [Vanilla JS Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [KaTeX Documentation](https://katex.org/docs/api.html)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Marked.js Documentation](https://marked.js.org/)

### Getting Help
- 💬 [Open a Discussion](https://github.com/YOUR-REPO/discussions)
- 🐛 [Report an Issue](https://github.com/YOUR-REPO/issues)
- 📧 Email: [your-email]
- 🔗 Live Demo: [https://mathai.siddikhamim.com](https://mathai.siddikhamim.com)

## 🌍 Community

### Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

**In summary:**
- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community
- Show empathy

### Communication Channels

- **GitHub Issues**: Bug reports, feature requests
- **GitHub Discussions**: Questions, ideas, show & tell
- **Pull Requests**: Code contributions
- **Twitter**: [@your-handle] - Updates and announcements

### Recognition

Contributors are recognized in:
- GitHub contributors page (automatic)
- README.md (significant contributions)
- Release notes (feature contributions)

We appreciate every contribution, no matter how small! 🙏

## 📄 License

By contributing to MathAI, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](./LICENSE) file).

## ❓ Questions?

Don't hesitate to ask! Open a [Discussion](https://github.com/YOUR-REPO/discussions) or reach out to the maintainers.

**Remember**: There are no stupid questions. We were all beginners once! 💪

---

## 🎉 Thank You!

Your contributions make MathAI better for students and educators worldwide. Every bug fix, feature, and documentation improvement helps someone learn math more effectively.

**Happy coding! 🚀**

---

**Need help getting started?** Check out our [Good First Issues](https://github.com/YOUR-REPO/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or ask in [Discussions](https://github.com/YOUR-REPO/discussions)!
