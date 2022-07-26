FROM node:16-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm --production install

COPY . .

EXPOSE 3001

CMD ["node", "app.js"]
