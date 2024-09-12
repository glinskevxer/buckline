# The command line, packaged so a yard office can run it without a toolchain.
FROM node:20.17.0-bookworm-slim

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src

# Everything the container writes goes under /tmp, which exists and is writable
# for any uid. A bind mount from a host whose uid is not 1000 cannot be written
# to by this user, so nothing is written outside the image.
USER node

ENTRYPOINT ["node", "/app/bin/buckline.js"]
CMD ["--help"]
