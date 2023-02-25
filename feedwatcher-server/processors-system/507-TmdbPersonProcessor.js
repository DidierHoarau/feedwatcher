// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require("axios");

// eslint-disable-next-line no-undef
module.exports = {
  //
  getInfo: () => {
    let infokey = "";
    // eslint-disable-next-line no-undef
    if (!process.env.FEEDWATCHER_TMDB_API_KEY) {
      infokey =
        "<br /><small><small><small>Note: the API Key for this processor is not yet configured.</small></small></small>";
    }
    return {
      title: "TMDB Person",
      description:
        "Follows updates related to an actor, director, ...<br/>" +
        "Expected URLs: https://www.themoviedb.org/person/[person]" +
        infokey,
      icon: "film",
    };
  },

  test: async (source) => {
    // eslint-disable-next-line no-undef
    const API_KEY = process.env.FEEDWATCHER_TMDB_API_KEY;
    if (!API_KEY) {
      return null;
    }
    let urlMatch = /.*themoviedb.org\/person\/(\d+)-.*/.exec(source.info.url);
    if (urlMatch) {
      const personId = urlMatch[1];
      const personInfo = (await axios.get(`https://api.themoviedb.org/3/person/${personId}?api_key=${API_KEY}`)).data;
      if (personInfo.name) {
        return { name: personInfo.name, icon: "film" };
      }
    }
    return null;
  },

  fetchLatest: async (source, lastSourceItemSaved) => {
    // eslint-disable-next-line no-undef
    const API_KEY = process.env.FEEDWATCHER_TMDB_API_KEY;
    if (!API_KEY) {
      return null;
    }
    let urlMatch = /.*themoviedb.org\/person\/(\d+)-.*/.exec(source.info.url);
    const personId = urlMatch[1];
    const personCredit = (
      await axios.get(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${API_KEY}`)
    ).data;

    const sourceItems = [];
    const knownItems = { cast: [], crew: [] };
    for (const cast of personCredit.cast) {
      knownItems.cast.push(cast.id);
    }
    for (const crew of personCredit.crew) {
      knownItems.crew.push(crew.id);
    }

    for (const cast of personCredit.cast) {
      if (
        !lastSourceItemSaved ||
        (lastSourceItemSaved && lastSourceItemSaved.info.knownItems.cast.indexOf(cast.id) < 0)
      ) {
        const sourceItem = {};
        sourceItem.url = source.info.url;
        sourceItem.title = `Actor: ${cast.title}`;
        sourceItem.content = `Movie: ${cast.title}${
          cast.title !== cast.original_title ? "(" + cast.original_title + ")" : ""
        }<br/>Release Date: ${cast.release_date}<br />Character: ${cast.character}<br />${cast.overview}`;
        sourceItem.datePublished = new Date();
        sourceItem.info = {
          knownItems,
          type: "cast",
          castId: cast.id,
        };
        sourceItems.push(sourceItem);
      }
    }

    for (const crew of personCredit.crew) {
      if (
        !lastSourceItemSaved ||
        (lastSourceItemSaved && lastSourceItemSaved.info.knownItems.crew.indexOf(crew.id) < 0)
      ) {
        const sourceItem = {};
        sourceItem.url = source.info.url;
        sourceItem.title = `${crew.job}: ${crew.title}`;
        sourceItem.content = `Movie: ${crew.title}${
          crew.title !== crew.original_title ? "(" + crew.original_title + ")" : ""
        }<br/>Release Date: ${crew.release_date}<br />Job: ${crew.job}<br />${crew.overview}`;
        sourceItem.datePublished = new Date();
        sourceItem.info = {
          knownItems,
          type: "crew",
          crewId: crew.id,
        };
        sourceItems.push(sourceItem);
      }
    }

    return sourceItems;
  },
};
