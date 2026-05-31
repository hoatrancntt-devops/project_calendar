# Stage 1: Build the React application
FROM node:22-alpine as build
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./
RUN npm install

# Copy the rest of the application files and build
COPY . .
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Use nginx template dir so envsubst substitutes ${BACKEND_API_SECRET} at container start
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy the built application from the previous stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
