FROM node:22-alpine
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/index.html ./index.html
COPY web/vite.config.ts ./vite.config.ts
COPY web/tsconfig.json ./tsconfig.json
COPY web/src ./src
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
