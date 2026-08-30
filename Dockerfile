FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4173

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app ./app
COPY lib ./lib
COPY verifier ./verifier
COPY server.mjs ./

EXPOSE 4173
CMD ["npm", "start"]
