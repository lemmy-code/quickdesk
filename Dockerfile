FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npx tsc

EXPOSE 3001

CMD ["node", "dist/index.js"]
