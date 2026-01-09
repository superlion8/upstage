FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies like tsx)
# We do not use --only=production here because we need tsx
RUN npm ci

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Start using tsx directly (avoid npx interactive prompt risk)
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
