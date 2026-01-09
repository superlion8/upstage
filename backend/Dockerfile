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

# Start using tsx directly from source to bypass compilation issues
# This is a diagnostic step to ensure logs are visible and app starts
CMD ["npx", "tsx", "src/index.ts"]
