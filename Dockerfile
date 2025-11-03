FROM node:20
WORKDIR /app
COPY . .
EXPOSE 5173
EXPOSE 15000
RUN npm ci
CMD ["sh", "-c", "npm run dev:all"]
