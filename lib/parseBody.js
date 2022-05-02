const { JSDOM } = require('jsdom');
const blockTools = require('@sanity/block-tools').default;
const sanitizeHTML = require('./sanitizeHTML');
const { blockContentType } = require('../schemas/schema');

// we have to filter out missing/invalid content as it will break on migration
const missingImagesBlocklist = require('../missingImagesBlockList');
const { default: normalizeBlock } = require('@sanity/block-tools/lib/util/normalizeBlock');

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
      /*{
        deserialize(el, next, block) {
          // console.log(el.tagName.toLowerCase(), 'class: ', el.getAttribute("itemtype"));
          if (el.tagName.toLowerCase() === 'div' && el.getAttribute('itemtype') === 'http://schema.org/Recipe') {
            console.log('recipe div');
            const children = Array.prototype.slice.call(el.childNodes);
            var childrenHolder = [];
            console.log(children.length);
            children.forEach((node) => {
              console.log('node type: ', node.nodeName);
              // let tagType = 'text';
              // if (child.tagName.toLowerCase() === 'ul') {
              //   tagType = ''
              // }
              var tmp = {
                _type: 'text',
                text: node.textContent
              };
              childrenHolder.push(tmp);
            });
            return block({
              _type: 'recipe',
              items: childrenHolder
            });
          }
        }
      },

      // {
      //   "_type": "block", "markDefs": [], "style": "normal", "level": 1, "listItem": "number", "children"
      // {"_type":"block","markDefs":[],"style":"normal","level":1,"listItem":"number","children"

*/
      {
        deserialize(el, next, block) {
          if (el.tagName === 'IMG') {
            const imageUrl = el.getAttribute('src');

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
            });
          }

          if (
            el.tagName.toLowerCase() === 'p' &&
            el.childNodes.length === 1 &&
            el.childNodes.tagName &&
            el.childNodes[0].tagName.toLowerCase() === 'img'
          ) {
            const imageUrl = el.childNodes[0].getAttribute('src');

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
            });
          }
          return undefined;
        },
      },
    ],
  });
  return { blocks, errors };
}

module.exports = { htmlToBlocks, missingImagesBlocklist };
