.PHONY: install build dev package test clean help

help:
	@echo "kuziSlicer VSCode Extension — Build Commands"
	@echo ""
	@echo "Targets:"
	@echo "  make install    - Install dependencies"
	@echo "  make build      - Compile TypeScript to JavaScript"
	@echo "  make dev        - Watch mode for development"
	@echo "  make package    - Create .vsix extension package"
	@echo "  make test       - Run tests (if configured)"
	@echo "  make clean      - Remove build artifacts"

install:
	npm install

build:
	npm run compile

dev:
	npm run watch

package: build
	npx vsce package

test:
	npm test

clean:
	rm -rf out/ node_modules/ *.vsix
	find . -name "*.js" -not -path "./node_modules/*" -delete

.DEFAULT_GOAL := help
