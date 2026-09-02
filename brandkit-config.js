"use strict";
/**
 * kuziSlicer Brandkit Configuration
 * Centralized branding constants for the extension
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandConfig = void 0;
const path = __importStar(require("path"));
const BRANDKIT_PATH = path.join(__dirname, '..', 'brandkit');
exports.brandConfig = {
    // Brand identity
    appName: 'kuziSlicer',
    appVersion: '0.1.0',
    // Paths to brandkit assets
    paths: {
        colors: path.join(BRANDKIT_PATH, 'colors'),
        fonts: path.join(BRANDKIT_PATH, 'fonts'),
        icons: path.join(BRANDKIT_PATH, 'icons'),
        logos: path.join(BRANDKIT_PATH, 'logos'),
    },
    // Primary colors (extract from brandkit/colors)
    colors: {
        primary: '#0066cc', // Will be overridden by brandkit
        secondary: '#6c757d',
        accent: '#ffc107',
        background: '#ffffff',
        surface: '#f8f9fa',
        text: '#212529',
        textMuted: '#6c757d',
        error: '#dc3545',
        success: '#28a745',
        warning: '#ffc107',
    },
    // Typography
    fonts: {
        family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
        sizes: {
            xs: '12px',
            sm: '14px',
            base: '16px',
            lg: '18px',
            xl: '20px',
            '2xl': '24px',
        },
    },
};
exports.default = exports.brandConfig;
