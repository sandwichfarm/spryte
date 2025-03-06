# Example Application

This is a demonstration application that showcases how to use the Sprite Generator system with a Svelte frontend.

## Features

- Complete Svelte application integrating all sprite generation components
- Demonstrates loading and displaying sprite images
- Includes Tailwind CSS for styling
- Provides a reference implementation for integrating the sprite system

## Setup and Run

1. Navigate to the example directory:
   ```bash
   cd example
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

4. Open your browser at the indicated URL (typically http://localhost:5173)

## Structure

- `src/App.svelte`: Main application component demonstrating sprite usage
- `src/lib/`: Utility functions and components
- `src/main.ts`: Application entry point
- `public/`: Static assets

## Configuration

The example uses Vite, Svelte, and Tailwind CSS with configurations in:
- `vite.config.ts`
- `svelte.config.js`
- `tailwind.config.cjs`
- `postcss.config.cjs`
- `tsconfig.json` 