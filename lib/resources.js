const axios = require('axios');
const he = require('he');
const cheerio = require("cheerio");

const { htmlToBlocks, missingImagesBlocklist } = require('./parseBody');
const { logMediaErrors } = require('./errors');
const { default: normalizeBlock } = require('@sanity/block-tools/lib/util/normalizeBlock');

const ITEMS_PER_PAGE = 100;
let wpApiUrl;

const getAllWordpressPages = async (resourceEndpoint) => {
  const count = await axios.get(resourceEndpoint).then((response) => {
    return response.headers['x-wp-totalpages'];
  });

  const promiseArray = [];

  for (let i = 0; i < count; i++) {
    const endpoint = `${resourceEndpoint}&page=${i + 1}`;
    promiseArray.push(axios.get(endpoint));
  }
  const responseArrays = await Promise.all(promiseArray);
  // flatten the array of arrays
  return [].concat.apply(
    [],
    responseArrays.map(({ data }) => data),
  );
};

const getWpMedia = async () => {
  const mediaEndpoint = `${wpApiUrl}/media?per_page=${ITEMS_PER_PAGE}`;

  return getAllWordpressPages(mediaEndpoint).then((data) => data.map(({ id, guid }) => ({ id, url: guid.rendered })));
};

const getUsers = async () => {
  const usersEndpoint = `${wpApiUrl}/users?per_page=${ITEMS_PER_PAGE}`;
  const users = await getAllWordpressPages(usersEndpoint);

  return users.map(({ id, name, slug, description, avatar_urls }) => {
    return {
      _id: `author-${id}`,
      _type: 'author',
      name,
      slug: { current: slug },
      description,
      image: avatar_urls
        ? {
            _type: 'mainImage',
            _sanityAsset: 'image@' + avatar_urls['96'],
          }
        : undefined,
    };
  });
};

const getCategories = async () => {
  const categoriesEndpoint = `${wpApiUrl}/categories?per_page=${ITEMS_PER_PAGE}`;
  const categories = await getAllWordpressPages(categoriesEndpoint);

  return categories.map(({ id, name }) => {
    return {
      _id: `category-${id}`,
      _type: 'category',
      title: name,
    };
  });
};

const getTags = async () => {
  const tagsEndpoint = `${wpApiUrl}/tags?per_page=${ITEMS_PER_PAGE}`;
  const tags = await getAllWordpressPages(tagsEndpoint);

  return tags.map(({ id, name }) => {
    return {
      _id: `tag-${id}`,
      _type: 'tag',
      title: name,
    };
  });
};

const getPosts = async (wpMedia) => {
  const postsEndpoint = `${wpApiUrl}/posts?include[]=6931`;
  // const postsEndpoint = `${wpApiUrl}/posts?per_page=${ITEMS_PER_PAGE}`;
  const posts = await getAllWordpressPages(postsEndpoint);
  return posts.map(({ id, title, slug, categories, tags, author, featured_media, date, content, excerpt }) => {
    const featuredMedia = wpMedia.find(({ id }) => id == featured_media);
    const isFeaturedMediaValid = featuredMedia && !missingImagesBlocklist.includes(featuredMedia.url);
    const $ = cheerio.load(content.rendered);
    $('.zlrecipe-print-link').remove();
    $('.ziplist-recipe-plugin').remove();
    $('#zl-printed-permalink').remove();
    const recipeHTML = $('#zlrecipe-container').html();
    const recipe = normalizeBlock(htmlToBlocks(recipeHTML));

    $('#zlrecipe-container').remove();
    $('.zlrecipe-container-border').remove();
    $('.addtoany_share_save_container').remove();
    const { blocks: parsedBody, errors } = htmlToBlocks($.html());
    const { blocks: parsedExcerpt } = htmlToBlocks(excerpt.rendered);

    logMediaErrors({ errors, id, title, featuredMedia });
    const post = {
      _id: `post-${id}`,
      _type: 'post',
      title: he.decode(title.rendered),
      slug: {
        current: slug,
      },
      publishedAt: date,
      categories: categories.map((id) => {
        return {
          _type: 'reference',
          _ref: `category-${id}`,
        };
      }),
      tags: tags.map((id) => {
        return {
          _type: 'reference',
          _ref: `tag-${id}`,
        };
      }),
      authors: 
        {
          _type: 'reference',
          _ref: `author-${author}`,
        },
      mainImage: isFeaturedMediaValid
        ? {
            type: 'mainImage',
            _sanityAsset: `image@${featuredMedia.url}`,
          }
        : undefined,
      excerpt: parsedExcerpt,
      body: parsedBody,
      recipe: recipe.blocks
    };
    return post;
  });
};

module.exports.getWordpressData = async (baseUrl) => {
  wpApiUrl = `${baseUrl}/wp-json/wp/v2`;
  const wpMedia = await getWpMedia(wpApiUrl);
  const [users, categories, tags, blogPosts] = await Promise.all([getUsers(), getCategories(), getTags(), getPosts(wpMedia)]);
  return [...users, ...categories, ...tags, ...blogPosts];
};
