import fs from "fs/promises";
import path from "path";

const TEMPLATE_DIR = path.resolve(
  process.cwd(),
  "templates"
);


const templates: Record<string, string> = {

  "package.json": `
{
  "name": "nextjs-app",
  "version": "0.1.0",
  "private": true,

  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },

  "dependencies": {
    "next": "15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },

  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^22",
    "@types/react": "^19"
  }
}
`,



"next.config.ts": `
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
`,



"tsconfig.json": `
{
  "compilerOptions": {
    "target": "ES2017",

    "lib": [
      "dom",
      "dom.iterable",
      "esnext"
    ],

    "strict": true,

    "noEmit": true,

    "module": "esnext",

    "moduleResolution": "bundler",

    "jsx": "preserve",

    "incremental": true,

    "plugins": [
      {
        "name": "next"
      }
    ],

    "paths": {
      "@/*": [
        "./*"
      ]
    }
  },

  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],

  "exclude": [
    "node_modules"
  ]
}
`,



".env": `
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE:
// This file should not be edited
// see https://nextjs.org/docs
`,



".gitignore": `
node_modules
.next
out
.env
.env.local
`,

"Dockerfile":`
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING_INTERVAL=1000
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD ["npm", "run", "dev"]`,


"app/layout.tsx": `
import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "My Next App",
  description: "Created with Web Weaver"
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );

}
`,



"app/page.tsx": `
export default function Home(){

  return (

    <main>
      <h1>
        Welcome to your Next.js project 🚀
      </h1>

      <p>
        Start building your application.
      </p>
    </main>

  );

}
`,



"app/globals.css": `
* {
  box-sizing: border-box;
}


html,
body {
  margin:0;
  padding:0;
}


body {
  font-family:
    Arial,
    Helvetica,
    sans-serif;
}
`

};



export async function seedTemplates(destination:string){

  for(
    const [relativePath, content]
    of Object.entries(templates)
  ){

    const filePath = path.join(
      destination,
      relativePath
    );


    await fs.mkdir(
      path.dirname(filePath),
      {
        recursive:true
      }
    );


    await fs.writeFile(
      filePath,
      content.trim()
    );


    console.log(
      `Created template: ${relativePath}`
    );

  }


  console.log(
    "✅ Next.js template created"
  );

}




