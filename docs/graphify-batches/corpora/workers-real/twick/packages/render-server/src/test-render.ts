/**
 * Test file for rendering a video with an example project
 * 
 * This script demonstrates how to use the renderTwickVideo function
 * to create a video from a Twick project configuration.
 * 
 * Run with: tsx src/test-render.ts
 */

import { renderTwickVideo } from "./index.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Example project configuration
 * This creates a simple video with:
 * - A colored background rectangle
 * - Animated text elements
 * - Audio track
 */
const exampleProject = {
  input: {
    properties: {
      width: 720,
      height: 1280,
      fps: 30,
    },
    "tracks": [
      {
          "id": "t-sample",
          "name": "sample",
          "type": "element",
          "props": {},
          "elements": [
              {
                  "id": "e-sample",
                  "trackId": "t-sample",
                  "type": "text",
                  "name": "sample",
                  "s": 0,
                  "e": 5,
                  "props": {
                      "text": "Twick SDK",
                      "fill": "#FFFFFF"
                  }
              }
          ]
      },
      {
          "id": "t-948a8e683ebb",
          "name": "Track_1772121198607",
          "type": "element",
          "props": {},
          "elements": [
              {
                  "id": "e-cc0401034d3e",
                  "trackId": "t-948a8e683ebb",
                  "type": "image",
                  "s": 0,
                  "e": 3,
                  "props": {
                      "src": "https://images.pexels.com/photos/358457/pexels-photo-358457.jpeg",
                      "mediaFilter": "none"
                  },
                  "frame": {
                      "size": [
                          720,
                          1080.2700675168792
                      ],
                      "x": 0,
                      "y": 0
                  },
                  "frameEffects": [],
                  "objectFit": "cover"
              }
          ]
      },
      {
          "id": "t-85e232b36bdf",
          "name": "Track_177212120267f",
          "type": "element",
          "props": {},
          "elements": [
              {
                  "id": "e-b262ef2b4fff",
                  "trackId": "t-85e232b36bdf",
                  "type": "audio",
                  "s": 0,
                  "e": 1,
                  "props": {
                      "src": "https://cdn.pixabay.com/audio/2022/03/14/audio_782eeb590e.mp3"
                  }
              },
                {
                  "id": "e-b262ef2b4ffe",
                  "trackId": "t-85e232b36bdf",
                  "type": "audio",
                  "s": 3,
                  "e": 4,
                  "props": {
                      "src": "https://cdn.pixabay.com/audio/2022/03/14/audio_782eeb590e.mp3"
                  }
              }
          ]
      }
  ],
      "version": 6,
      "metadata": {}
  },
};

/**
 * Render settings
 */
const renderSettings = {
  outFile: `test-video-${Date.now()}.mp4`,
  outDir: join(__dirname, "../output"),
  quality: "medium",
  logProgress: true,
};

/**
 * Main test function
 */
async function testVideoRender() {
  console.log("🎬 Starting video render test...\n");
  console.log("📋 Project Configuration:");
  console.log(`   Resolution: ${exampleProject.input.properties.width}x${exampleProject.input.properties.height}`);
  console.log(`   FPS: ${exampleProject.input.properties.fps}`);
  console.log(`   Tracks: ${exampleProject.input.tracks.length}`);
  console.log(`   Total Elements: ${exampleProject.input.tracks.reduce((sum, track) => sum + track.elements.length, 0)}\n`);

  try {
    console.log("🔄 Rendering video...");
    const startTime = Date.now();

    const outputPath = await renderTwickVideo(exampleProject, renderSettings);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n✅ Video rendered successfully!");
    console.log(`📁 Output file: ${outputPath}`);
    console.log(`⏱️  Render time: ${duration}s`);
    console.log(`\n🎉 Test completed successfully!`);

    return outputPath;
  } catch (error) {
    console.error("\n❌ Render failed:");
    console.error(error);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    }
    process.exit(1);
  }
}

// Run the test
testVideoRender().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
