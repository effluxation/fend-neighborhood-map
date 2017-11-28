// Main global google map variables accessed by ViewModel
let museumMap;
let mainInfoWindow;
let mapBounds;

// Array of map markers holding default locations
const markers = [];

class MuseumMapViewModel {
  constructor () {
    const self = this;
    self.mapReady = ko.observable(false);
    self.query = ko.observable('');

    // Observable Markers Array that will determine display of list and markers
    self.markersObservable = ko.observableArray([]);
    // Computed observable loads markers once map initialization complete
    self.createMarkersObservable = ko.computed(function () {
      if (self.mapReady()) {
        self.markersObservable(markers);
        self.sort(self.markersObservable);
        return true;
      }
    }, self);

    self.clickMuseumList = function (clickedMarker) {
      MuseumMapViewModel.popInfoWindow(clickedMarker);
      MuseumMapViewModel.toggleBounceMarker(clickedMarker);
    };

    self.filterMarkerList = function (searchInput) {
      // Search query is a non-empty string
      if (searchInput) {
        // Empty the observable list
        self.markersObservable([]);
        for (const marker of markers) {
          const markerTitle = marker.title.toUpperCase();
          if (markerTitle.indexOf(searchInput.toUpperCase()) >= 0) {
            // Readd markers to observable array only if title match search query
            self.markersObservable.push(marker);
            // Check if marker not already displayed to prevent blinking due to setting map again
            if (!marker.getMap()) marker.setMap(museumMap);
          } else {
            // Marker title did not match search query, remove it from map
            marker.setMap(null);
          }
        }
        // Sort remaining markers after query
        self.sort(self.markersObservable);

      // Search query is empty string ''
      } else {
        // Display all markers on map
        for (const marker of markers) {
          if (!marker.getMap()) marker.setMap(museumMap);
        }
        // Display all list items
        self.markersObservable(markers);
        self.sort(self.markersObservable);
      }
    };

    // Observable Subscriptions
    self.query.subscribe(self.filterMarkerList);
  }

  // ViewModel Methods

  // Alphabetically sort display of museums by title
  sort (observableArray) {
    observableArray.sort((first, second) => {
      return first.title === second.title ? 0 : (first.title > second.title ? 1 : -1);
    });
  }

  static toggleBounceMarker (marker) {
    if (marker.getAnimation()) {
      // If click again during animation marker, will stop
      marker.setAnimation(null);
    } else {
      // Disable bounce on all markers and set temporary bounce on selected marker
      markers.forEach(otherMarker => { otherMarker.setAnimation(null); });
      marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => marker.setAnimation(null), 1500);
    }
  }

  static popInfoWindow (marker) {
    // First check if InfoWindow not already onen on clicked marker
    if (mainInfoWindow.marker !== marker) {
      mainInfoWindow.marker = marker;

      // Center on marker & move up map to allow for info window display
      museumMap.panTo(marker.position);
      museumMap.panBy(0, -200);

      // Begin construction of InfoWindow content
      let markerContent = `<div class="title"><strong>${marker.title}</strong></div>`;

      // Spinner HTML below taken from http://tobiasahlin.com/spinkit/
      markerContent += '<div class="sk-circle">';
      for (let circleNum = 1; circleNum <= 12; circleNum++) {
        markerContent += `<div class="sk-circle${circleNum} sk-child"></div>`;
      }
      markerContent += '</div>';
      // END spinner HTML injection code

      // Place title & spinner into InfoWindow & open it
      mainInfoWindow.setContent(markerContent);
      mainInfoWindow.open(museumMap, marker);

      // Begin fetching data from Yelp
      getYelp(marker).then(yelpInfo => {
        // Only enter here if no connection issues
        if (yelpInfo) {
          // Yelp result exists. Remove spinner by reassigning markerContent
          markerContent = `<div class="title"><strong>${marker.title}</strong></div>`;
          markerContent += `<img class="yelp-img" src=${yelpInfo.image_url} alt=${marker.title}>`;
          markerContent += `<div class="yelp-container">${getRatingImg(yelpInfo.rating)}`;
          markerContent += `<a target="_blank" href="${yelpInfo.url}"><img class="yelp-logo" \
src="img/yelp_trademark_rgb_outline.png" srcset="img/yelp_trademark_rgb_outline_2x.png 2x" \
alt="Yelp Logo"></a>`;
          markerContent += `<a class="yelp-reviews" href="${yelpInfo.url}" target="_blank">Based \
on <strong>${yelpInfo.review_count}</strong> review${yelpInfo.review_count > 1 ? 's' : ''}</a>`;
          markerContent += `<p><address>${getYelpAddressHtml(yelpInfo.location.display_address)}\
</address></p>`;
          markerContent += `<p class="yelp-info">Currently \
<strong>${yelpInfo.is_closed ? 'CLOSED' : 'OPEN'}</strong><br>`;
          markerContent += `Phone: ${yelpInfo.display_phone}</p></div>`;
          mainInfoWindow.setContent(markerContent);
        } else {
        // Result undefined, search term not in Yelp database
          markerContent = `<div class="title"><strong>${marker.title}</strong></div>`;
          markerContent += `<p>This museum's information is not found in Yelp's business \
directory. Try a different museum location.</p>`;
          mainInfoWindow.setContent(markerContent);
        }
      })
      // In case of connection error to cors-anywhere.herokuapp.com or
      // api.yelp.com
      .catch((err) => {
        markerContent = `<div class="title"><strong>${marker.title}</strong></div>`;
        markerContent += `<p>Unable to retrieve this museum's Yelp data due to a \
connection error. Please try again later.</p>`;
        mainInfoWindow.setContent(markerContent);
        console.log(err);
      });
    }

    // Helper method for formatting Yelp address html string
    function getYelpAddressHtml (yelpAddress) {
      // Remove 'Japan' from address since it's redundant in the context of a map of Tokyo
      if (yelpAddress[yelpAddress.length - 1] === 'Japan') {
        yelpAddress = yelpAddress.slice(0, yelpAddress.length - 1);
      }
      return yelpAddress.join('<br>');
    }

    // Helper method for selection and formatting of correct Yelp star rating img
    function getRatingImg (rating) {
      const ratingWhole = Math.floor(rating);
      const ratingHalf = (rating - ratingWhole === 0.5 ? '_half' : '');
      return `<img class="yelp-rating" src="img/yelp_stars_reg/regular_${ratingWhole}${ratingHalf}\
.png" srcset="img/yelp_stars_reg/regular_${ratingWhole}${ratingHalf}@2x.png 2x">`;
    }

    // Helper method for formatting search string from title
    function getSearchString (museumTitle) {
      return museumTitle.replace(/\s+/g, '+');
    }

    // Helper method for fetching Yelp info
    function getYelp (museumMarker) {
      // Since client-side requests to Yelp V3 API are not possible due to lack
      // of support for CORS and JSONP, 'cors-anywhere' app hack is employed as a proxy
      const YELP_TOKEN = `n9BZFWy_zC3jyQyNV9u0Tdc6IhfkwyV8b4JBg2NYD9AaQuHaUx6II9\
ukiEQp2Z03m7Cmycz29Lu2n4Gc5LPu1wDjVVCGyignkEoZn167yyq07sbPEN7gF5GzE20YWnYx`;

      return fetch(`https://cors-anywhere.herokuapp.com/https://api.yelp.com/v3/\
businesses/search?term=${getSearchString(museumMarker.title)}&latitude=\
${museumMarker.position.lat()}&longitude=${museumMarker.position.lng()}`,
        {
          method: 'GET',
          headers: {
            'authorization': `Bearer ${YELP_TOKEN}`
          }
        })
        .catch(err => {
          // In case connection error to cors-anywhere.herokuapp.com
          window.alert(`Unable to retrieve this museum's Yelp data due to a \
connection error. Please try again later.`);
          return Promise.reject(err);
        })
        .then(response => {
          // Both cors-anywhere.herokuapp.com and api.yelp.com reachable
          if (response.ok) return response;
          // cors-anywhere.herokuapp.com ok, api.yelp.com fails
          else return Promise.reject(new Error('api.yelp.com connection error'));
        })
        .then(response => response.json())
        .then(responseJSON => responseJSON.businesses[0]);
    }
  // END of method popInfoWindow(marker)
  }

  // Called by Reset <button>
  resetMap () {
    this.query('');
    museumMap.fitBounds(mapBounds);
    museumMap.panBy(0, -100);
    mainInfoWindow.marker = null;
    mainInfoWindow.close();
  }
}

// KOjs ViewModel initialization
const tokyoMuseumViewModel = new MuseumMapViewModel();
ko.applyBindings(tokyoMuseumViewModel);

// Map initalization function called by maps script
function initMap () {
  // Create new map
  museumMap = new google.maps.Map(document.querySelector('#map'), {
    // Center on Tokyo
    center: {
      lat: model.initial.lat,
      lng: model.initial.lng
    },
    zoom: 12
  });
  mapBounds = new google.maps.LatLngBounds();

  // InfoWindow configuration
  mainInfoWindow = new google.maps.InfoWindow({
    maxWidth: 250
  });
  mainInfoWindow.addListener('closeclick', function () {
    mainInfoWindow.marker = null;
  });

  // Icon image:
  // Maps Icons Collection https://mapicons.mapsmarker.com
  // CC BY SA 3.0
  const museumIconImage = 'img/temple-2.png';

  // Create array of Markers from provided museum info
  for (const museum of model.museums) {
    const newMarker = new google.maps.Marker({
      position: museum.location,
      title: museum.title,
      animation: google.maps.Animation.DROP,
      icon: museumIconImage,
      map: museumMap
    });
    newMarker.addListener('click', function () {
      MuseumMapViewModel.popInfoWindow(this);
      MuseumMapViewModel.toggleBounceMarker(this);
    });
    markers.push(newMarker);
    mapBounds.extend(newMarker.position);
  }

  // Adjust map bounds to fit all markers
  museumMap.fitBounds(mapBounds, -50); // TODO
  museumMap.panBy(0, -100); // TODO

  // Notify MapViewModel that google map initialization is complete
  tokyoMuseumViewModel.mapReady(true);
}

// Google map initial loading error callback
errorLoadMap = function () {
  alert('Unable to load Google Map at this time. Check your connection or try again later');
}
