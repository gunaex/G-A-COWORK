FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json ./
RUN npm install --production

# Copy source
COPY src/ ./src/

# Create workspace directories
RUN mkdir -p /workspace/inbound /workspace/projects

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "src/server.js"]
