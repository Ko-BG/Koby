# Step 1: Use a professional Node.js base
FROM node:18-slim

# Step 2: Set the working directory inside the container
WORKDIR /usr/src/app

# Step 3: Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Step 4: Copy all files (server.js and index.html) into the container
COPY . .

# Step 5: Expose the port your server.js is listening on
EXPOSE 3000

# Step 6: Define the command to run your master server
CMD [ "node", "server.js" ]
