# Quick Start Guide - Hei Atlas Web Interface

## One-Command Setup

```bash
npm install && npm run dev
```

## Step-by-Step Instructions

### 1. Prerequisites Check
Ensure you have Node.js installed:
```bash
node --version  # Should be v16.0.0 or higher
npm --version   # Should be v7.0.0 or higher
```

If not installed, download from: https://nodejs.org/

### 2. Navigate to Project Directory
```bash
cd oncology-solutions-web
```

### 3. Install Dependencies
```bash
npm install
```

This will download and install:
- Next.js
- React
- TypeScript
- Tailwind CSS
- All other required packages

**Expected time**: 2-5 minutes depending on internet speed

### 4. Start Development Server
```bash
npm run dev
```

**Expected output**:
```
> oncology-solutions-web@0.1.0 dev
> next dev

  ▲ Next.js 14.0.0
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.5s
```

### 5. Open in Browser
Navigate to: **http://localhost:3000**

The application should load immediately with:
- Centered "Hei Atlas" header
- Search bar
- Large blue microphone button
- Footer with links

## Testing the Application

### Test Search Functionality
1. Click on the search input field
2. Type: "Stage 3 lung cancer treatment options"
3. Press **Enter**
4. Open browser DevTools (F12) → Console tab
5. Verify the query appears in console

### Test Microphone Button
1. Click the large blue microphone button
2. Button should turn red and pulse animation should appear
3. Console should log: "Microphone activated - Listening started"
4. Click again to deactivate
5. Console should log: "Microphone deactivated - Listening stopped"

### Test Navigation
1. Click "Login" button → Console logs "Login clicked"
2. Click "Signup" button → Console logs "Signup clicked"
3. Click "Resources" dropdown → Menu appears
4. Click "Download App" → Console logs "Download App clicked"
5. Click "User Guide" → Console logs "User Guide clicked"

### Test Footer
1. Scroll to bottom (or it's visible on desktop)
2. Click "Privacy Policy" → Console logs "Privacy Policy clicked"
3. Click "Terms" → Console logs "Terms clicked"
4. Click "Contact" → Console logs "Contact clicked"

## Stop the Development Server

Press **Ctrl+C** in the terminal running `npm run dev`

## Common Issues & Solutions

### Issue: "Port 3000 is already in use"
**Solution**:
```bash
# Option 1: Kill the process
lsof -ti:3000 | xargs kill -9

# Option 2: Use a different port
npm run dev -- -p 3001
# Then visit: http://localhost:3001
```

### Issue: "npm command not found"
**Solution**: Install Node.js from https://nodejs.org/

### Issue: Dependencies won't install
**Solution**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: Page won't load after `npm run dev`
**Solution**:
1. Check that server is running (should see "✓ Ready in Xs")
2. Clear browser cache (Ctrl+Shift+Delete)
3. Try a different browser
4. Restart dev server: Press Ctrl+C, then `npm run dev` again

## File Structure Overview

```
oncology-solutions-web/
├── app/
│   ├── page.tsx          ← Main page (search, microphone, main content)
│   ├── layout.tsx        ← App layout (header, footer wrapper)
│   └── globals.css       ← Global styles
├── components/
│   ├── Header.tsx        ← Navigation header
│   └── Footer.tsx        ← Footer
├── package.json          ← Dependencies list
├── tailwind.config.js    ← Tailwind CSS setup
├── next.config.js        ← Next.js configuration
└── README.md             ← Full documentation
```

## Development Workflow

### 1. Make Changes
Edit any `.tsx` or `.css` file

### 2. Auto-Reload
Browser automatically refreshes (check terminal for any errors)

### 3. View in Console
Open DevTools (F12) → Console tab to see logs

### 4. Verify Styling
Changes to Tailwind classes apply instantly

## Browser DevTools

### Opening DevTools
- **Windows/Linux**: Press **F12** or **Ctrl+Shift+I**
- **Mac**: Press **Cmd+Option+I**

### Console Tab
View all logged interactions:
- Search queries
- Button clicks
- Microphone state changes
- Navigation events

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open DevTools | F12 or Ctrl+Shift+I |
| Open Console | F12 then click Console |
| Reload Page | F5 or Ctrl+R |
| Hard Reload (clear cache) | Ctrl+Shift+R |
| Focus Search Bar | Click on input field |
| Submit Search | Enter key |
| Toggle Microphone | Click button or Space if focused |

## Environment

The application is configured for:
- **Node.js**: 16.x or higher
- **npm**: 7.x or higher
- **React**: 18.2.0
- **Next.js**: 14.0.0
- **TypeScript**: 5.3.0
- **Tailwind CSS**: 3.3.0

## Mobile Testing

### Responsive Design
The app is fully responsive. Test mobile layout:

1. Open DevTools (F12)
2. Click **Device Toolbar** icon (or press Ctrl+Shift+M)
3. Select device preset or set custom dimensions
4. Test at 375px width (mobile) and 1280px (desktop)

### Testing Different Sizes
- **Mobile**: 375px × 667px
- **Tablet**: 768px × 1024px
- **Desktop**: 1280px × 800px

## Next Steps

Once confirmed working:

1. **Customize**: Edit components to add features
2. **Deploy**: Build and deploy to Vercel, Netlify, or your server
3. **Connect Backend**: Integrate with your API
4. **Add Features**: Voice recognition, real API calls, etc.

## Production Build

When ready to deploy:

```bash
# Create optimized build
npm run build

# Test production build locally
npm start

# Deploy to hosting platform (Vercel, Netlify, etc.)
```

## Support

For detailed documentation, see: **README.md**

For issues:
1. Check console for error messages (DevTools → Console)
2. Verify Node.js and npm versions
3. Try clearing cache: `rm -rf .next node_modules`
4. Reinstall: `npm install`

## Verification Checklist

- [ ] Node.js installed (v16+)
- [ ] Project cloned/extracted
- [ ] `npm install` completed successfully
- [ ] `npm run dev` shows "✓ Ready"
- [ ] http://localhost:3000 loads
- [ ] Header shows "Hei Atlas"
- [ ] Search bar is visible
- [ ] Microphone button is blue and centered
- [ ] Console logs appear when clicking buttons
- [ ] Responsive design works on mobile (DevTools)

**You're all set! 🎉**
