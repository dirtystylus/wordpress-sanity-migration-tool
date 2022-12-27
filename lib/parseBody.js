const { JSDOM } = require('jsdom');
const blockTools = require('@sanity/block-tools').default;
const sanitizeHTML = require('./sanitizeHTML');
const { blockContentType } = require('../schemas/schema');

// we have to filter out missing/invalid content as it will break on migration
const missingImagesBlocklist = require('../missingImagesBlockList');

function htmlToBlocks(html) {
  if (!html) {
    return [];
  }
  const errors = { isUsingCdnImages: false, hasBlocklistedImage: false };

  const blocks = blockTools.htmlToBlocks(sanitizeHTML(html), blockContentType, {
    parseHtml: (htmlContent) => new JSDOM(htmlContent).window.document,
    rules: [
      {
        deserialize(el, next, block) {
          // Special case for code blocks (wrapped in pre and code tag)
          if (el.tagName.toLowerCase() !== 'pre') {
            return undefined;
          }
          const code = el.children[0];
          let text = '';
          if (code) {
            const childNodes = code && code.tagName.toLowerCase() === 'code' ? code.childNodes : el.childNodes;
            childNodes.forEach((node) => {
              text += node.textContent;
            });
          } else {
            text = el.textContent;
          }
          if (!text) {
            return undefined;
          }
          return block({
            children: [],
            _type: 'code',
            text: text,
          });
        },
      },
      {
        deserialize(el, next, block) {
          if (el.tagName === 'IMG') {
            const imageUrl = el.getAttribute('src');
            const altText = el.getAttribute('alt');

            if (imageUrl.includes('googleusercontent')) {
              // dont try to download blocks from google cdn as they'll be blocked
              errors.isUsingCdnImages = true;
              return undefined;
            }
            if (missingImagesBlocklist.some((url) => url === imageUrl)) {
              errors.hasBlocklistedImage = true;
              return undefined;
            }

            return block({
              _type: 'image',
              children: [],
              _sanityAsset: `image@${imageUrl.replace(/^\/\//, 'https://')}`,
              alt: altText,
            });
          }

          if (
            el.tagName.toLowerCase() === 'p' &&
            el.childNodes.length === 1 &&
            el.childNodes.tagName &&
            el.childNodes[0].tagName.toLowerCase() === 'img'
          ) {
            const imageUrl = el.childNodes[0].getAttribute('src');
            const altText = el.getAttribute('alt');
            console.log('p > img', imageUrl, ' alt', altText);

            if (imageUrl.includes('googleusercontent')) {
              // dont try to download blocks from google cdn as they'll be blocked
              errors.isUsingCdnImages = true;
              return undefined;
            }

            if (missingImagesBlocklist.some((url) => url === imageUrl)) {
              errors.hasBlocklistedImage = true;
              return undefined;
            }

            return block({
              _type: 'image',
              children: [],
              _sanityAsset: `image@${imageUrl.replace(/^\/\//, 'https://')}`,
              alt: altText,
            });
          }
          return undefined;
        },
      },
    ],
  });
  
  // const recipe = blocks.find((block) => block._type === "recipe");
  // console.log('recipe', recipe);
  return { blocks, errors };
}

module.exports = { htmlToBlocks, missingImagesBlocklist };
