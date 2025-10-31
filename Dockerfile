# ---------- Build Stage ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build the frontend
COPY . .
RUN npm run build

# ---------- Production Stage ----------
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling and serve for static hosting
RUN apk add --no-cache dumb-init && npm install -g serve

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built frontend and server code from builder
COPY --from=builder /app/dist ./dist
COPY server ./server

# Expose ports for backend (5000) and frontend (5173)
EXPOSE 5173

# Health check for backend API
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init as the entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Run both backend and frontend inside the same container
CMD ["sh", "-c", "node server/index.js & serve -s dist -l 5173 && wait"]
