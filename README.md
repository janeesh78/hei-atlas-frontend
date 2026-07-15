# Hei Atlas Web Interface

A modern, responsive web application for voice-enabled oncology decision support powered by clinical guidelines and AI reasoning.

## Features

- **Voice-Enabled Search**: Click the microphone button to activate voice input with visual feedback
- **Search Bar**: Text-based search with keyboard support (press Enter to submit)
- **Responsive Design**: Optimized for desktop and mobile devices
- **Modern UI**: Clean, minimal aesthetic with Tailwind CSS styling
- **Interactive Components**: Dropdown menus, hover effects, and animations
- **Console Logging**: All user interactions are logged to the browser console for debugging

## Tech Stack

- **Framework**: Next.js 14
- **React**: 18.2.0
- **TypeScript**: For type safety
- **Styling**: Tailwind CSS 3.3
- **Font**: Source Sans Pro (Google Fonts)
- **Package Manager**: npm

## Prerequisites

- Node.js 16.x or higher
- npm 7.x or higher

## Installation & Setup

1. **Clone or navigate to the project directory**:
   ```bash
   cd oncology-solutions-web
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

   This will install:
   - Next.js and React
   - Tailwind CSS and PostCSS
   - TypeScript and type definitions
   - ESLint for code quality

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open in browser**:
   - Navigate to: `http://localhost:3000`
   - The application will automatically reload on file changes

## Usage

### Search Bar
- Click on the search input field
- Type your oncology question or query
- Press **Enter** to submit
- Your query will be logged to the browser console

### Microphone Button
- Click the large blue circular button to activate voice listening
- The button will turn red and display a pulse ring animation when active
- Click again to deactivate
- State changes are logged to the browser console

### Navigation
- **Login**: Click the Login button (logs to console)
- **Signup**: Click the Signup button (logs to console)
- **Resources**: Click the Resources dropdown to access:
  - Download App
  - User Guide
- **Footer**: Click Privacy Policy, Terms, or Contact (logs to console)

## Project Structure

```
oncology-solutions-web/
├── app/
│   ├── layout.tsx          # Root layout with metadata
│   ├── page.tsx            # Main page component
│   └── globals.css         # Global styles and Tailwind directives
├── components/
│   ├── Header.tsx          # Header with logo, buttons, and dropdown
│   └── Footer.tsx          # Footer with links
├── public/                 # Static files (auto-generated)
├── package.json            # Project dependencies
├── tailwind.config.js      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS configuration
├── next.config.js          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── .eslintrc.json          # ESLint configuration
├── .gitignore              # Git ignore rules
├── .env.local              # Environment variables (local)
└── README.md               # This file
```

## Available Scripts

### Development
```bash
npm run dev
```
Starts the development server at `http://localhost:3000` with hot reload.

### Production Build
```bash
npm run build
```
Creates an optimized production build.

### Production Start
```bash
npm start
```
Starts the production server (requires `npm run build` first).

### Linting
```bash
npm run lint
```
Runs ESLint to check code quality.

## Styling Details

### Colors
- **Primary**: Blue (#2563eb) - Used for buttons and interactive elements
- **Background**: White (#ffffff)
- **Text**: Dark gray (#111827)
- **Borders**: Light gray (#e5e7eb)

### Typography
- **Font Family**: Source Sans Pro (imported from Google Fonts)
- **Logo**: 24-28px, bold weight
- **Text**: 16px (desktop) / 14px (mobile), regular weight

### Responsive Breakpoints
- **Mobile**: < 768px (md breakpoint)
- **Desktop**: ≥ 768px

### Key Dimensions
- **Search Bar**: 700px (desktop) / 90% width (mobile)
- **Microphone Button**: 120px × 120px
- **Border Radius**: 8px (0.5rem)

## Browser Console

All user interactions are logged to the browser console for debugging:
- "Search query: [query text]" - when search is submitted
- "Microphone activated - Listening started" - when mic button is clicked (active)
- "Microphone deactivated - Listening stopped" - when mic button is clicked (inactive)
- "[Item] clicked" - for dropdown items
- "Login clicked" - when login button is clicked
- "Signup clicked" - when signup button is clicked
- "[Footer Item] clicked" - for footer links

Open the browser DevTools (F12) to view the console.

## Development Tips

1. **Hot Reload**: Changes to files are automatically reloaded in the browser
2. **Type Safety**: TypeScript provides real-time type checking
3. **Tailwind IntelliSense**: Install the Tailwind CSS IntelliSense extension in VS Code for autocomplete
4. **Console Debugging**: Use the browser console to verify interactions and state changes
5. **Responsive Testing**: Use browser DevTools device toolbar to test mobile responsiveness

## Troubleshooting

### Port 3000 Already in Use
```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or specify a different port
npm run dev -- -p 3001
```

### Dependencies Installation Issues
```bash
# Clear npm cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Issues
```bash
# Clean build cache
rm -rf .next
npm run build
```

## Performance Optimizations

- **Next.js Optimization**: Automatic code splitting and lazy loading
- **Tailwind CSS**: Purges unused styles in production
- **Image Optimization**: Built-in Next.js image optimization
- **TypeScript**: Catches errors at compile time
- **ESLint**: Enforces code quality standards

## Accessibility

- Semantic HTML structure
- ARIA labels on interactive elements
- Keyboard support (Enter to submit search)
- Focus states on buttons and inputs
- Sufficient color contrast

## License

© 2024 Hei Atlas. All rights reserved.

## Support

For issues or questions, please contact support@heiatlas.com
