# Use Node.js Slim (Debian-based) to ensure glibc runtime compatibility
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Install required system tools (cURL, OpenSSL, procps for process management)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    openssl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install NPM dependencies
COPY package.json ./
RUN npm install --production

# Copy all source files
COPY . .

# Expose the default HTTP port (override with PORT env var if needed)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]