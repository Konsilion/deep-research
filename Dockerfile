FROM node:22-alpine

WORKDIR /app

COPY . .
COPY package.json ./
COPY .env.local ./.env.local

RUN npm install

CMD ["npm", "run", "docker"]
