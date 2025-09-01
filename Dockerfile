# The command line, packaged so a yard office can run it without a toolchain.
#
# There is no build step. The program is JavaScript that node runs directly, so
# the image is the runtime, the lockfile and two directories, and it is small
# because there is one runtime dependency to install.

FROM node:20.18.2-bookworm-slim

LABEL org.opencontainers.image.title="buckline"
LABEL org.opencontainers.image.description="Log scaling, grading, bucking and settlement for a hardwood sawmill"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.source="https://github.com/glinskevxer/buckline"

ENV NODE_ENV=production

WORKDIR /app

# The lockfile first and on its own, so a change to the source does not throw
# the install layer away.
COPY package.json package-lock.json ./

# --ignore-scripts because nothing here needs a package to run code at install
# time, and a dependency that wants to is a dependency worth hearing about.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY bin ./bin
COPY src ./src

# Runs as the image's own unprivileged user. The program writes nothing except
# where it is told to, so there is no writable directory to create. Note what
# that means for a bind mount: a mount from a host whose uid is not 1000 cannot
# be written to by this user, so a yard book kept on the host needs the mount
# to carry the right ownership rather than the image to run as root.
USER node

ENTRYPOINT ["node", "/app/bin/buckline.js"]
CMD ["--help"]
