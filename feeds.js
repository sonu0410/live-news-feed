// News sources for each category.
// You can add, remove or change any feed here. Any website that offers an
// RSS feed works: search "<site name> RSS feed" to find its link.

module.exports = [
  {
    id: 'top',
    name: 'Top stories',
    feeds: [
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
      { source: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms' }
    ]
  },
  {
    id: 'india',
    name: 'India',
    feeds: [
      { source: 'The Hindu', url: 'https://www.thehindu.com/news/national/feeder/default.rss' },
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml' }
    ]
  },
  {
    id: 'world',
    name: 'World',
    feeds: [
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/news/international/feeder/default.rss' }
    ]
  },
  {
    id: 'business',
    name: 'Business',
    feeds: [
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/business/feeder/default.rss' }
    ]
  },
  {
    id: 'technology',
    name: 'Technology',
    feeds: [
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/sci-tech/technology/feeder/default.rss' }
    ]
  },
  {
    id: 'sports',
    name: 'Sports',
    feeds: [
      { source: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
      { source: 'The Hindu', url: 'https://www.thehindu.com/sport/feeder/default.rss' }
    ]
  }
];
