/*jshint indent:2, curly:true eqeqeq:true, immed:true, latedef:true,
newcap:true, noarg:true, regexp:true, undef:true, strict:true, trailing:true
white:true*/
/*global XT:true, XM:true, Backbone:true, _:true, console:true, Globalize:true */

(function () {
  "use strict";

  var _rateCache;
  
  /**
    @class

    @extends XM.Document
  */
  XM.Currency = XM.Document.extend({
    /** @scope XM.Currency.prototype */

    recordType: 'XM.Currency',

    documentKey: 'name',

    enforceUpperKey: false,

    defaults: {
      isBase: false
    },

    requiredAttributes: [
      'abbreviation',
      'isBase',
      'name',
      'symbol'
    ],
    
    // ..........................................................
    // METHODS
    //

    abbreviationDidChange: function (model, value, options) {
      var that = this,
        checkOptions = {};
      if (this.isNotReady()) { return; }

      checkOptions.success = function (resp) {
        var err, params = {};
        if (resp) {
          params.attr = "_abbreviation".loc();
          params.value = value;
          err = XT.Error.clone('xt1008', { params: params });
          that.trigger('error', that, err, options);
        }
      };
      this.findExisting('abbreviation', value, checkOptions);
    },

    initialize: function () {
      XM.Document.prototype.initialize.apply(this, arguments);
      this.on('change:abbreviation', this.abbreviationDidChange);
    },

    /**
      This version of `save` first checks to see if the abbreviation already
      exists before committing.
    */
    save: function (key, value, options) {
      var model = this,
        K = XM.Model,
        currAbbr = this.get('abbreviation'),
        origAbbr = this.original('abbreviation'),
        status = this.getStatus(),
        checkOptions = {};

      // Check for number conflicts if we should
      if (status === K.READY_NEW ||
          (status === K.READY_DIRTY && currAbbr !== origAbbr)) {
        checkOptions.success = function (resp) {
          var err, params = {};
          if (resp === 0) {
            XM.Document.prototype.save.call(model, key, value, options);
          } else {
            params.attr = "_abbreviation".loc();
            params.value = currAbbr;
            err = XT.Error.clone('xt1008', { params: params });
            model.trigger('error', model, err, options);
          }
        };
        checkOptions.error = Backbone.wrapError(null, model, options);
        this.findExisting('abbreviation', currAbbr, checkOptions);

      // Otherwise just go ahead and save
      } else {
        XM.Document.prototype.save.call(model, key, value, options);
      }
    },
    
    /**
      Converts a value in the currency instance to base value via the success
      callback in options.
      
      @param {Number} Local value
      @param {Date} asOf
      @param {Function} Options
      @returns {Object} Receiver
    */
    toBase: function (localValue, asOf, options) {
      options = options ? _.clone(options) : {};
      var that = this,
        rates = new XM.CurrencyRateCollection(),
        fetchOptions = {},
        baseValue,
        rate,
        params,
        err;
        
      // If invalid arguments, bail
      if (!this.id || !asOf || !options.success) { return this; }
      
      // If we're already the base currency, then just pass through
      if (this.get("isBase")) {
        options.success(localValue);
        return this;
      }
      
      // See if we already have the rate
      rate = _.find(_rateCache.models, function (rate) {
        var effective = rate.get("effective"),
          expires = rate.get("expires");
        return rate.id === that.id && XT.Date.inRange(asOf, effective, expires);
      });

      // If we have conversion data already, use it
      if (rate) {
        baseValue = localValue / rate.get("rate");
        options.success(baseValue);
        
      // Otherwise, go get it
      } else {
        // Define the query
        fetchOptions.query = {
          parameters: [
            {
              attribute: "effective",
              operator: ">=",
              value: asOf
            },
            {
              attribute: "expires",
              operator: "<=",
              value: asOf
            }
          ]
        };
        
        // Define the results handler
        fetchOptions.success = function () {
          // If no results report an error
          if (!rates.length) {
            if (options.error) {
              params.currency = this.get("abbreviation");
              params.asOf = Globalize.format(asOf, "d");
              err = XT.Error.clone('xt2010', { params: params });
              options.error(err);
            }
            return;
          }
          rate = rates.at(0);
          
          // Cache rate for later use
          _rateCache.add(rate);
          
          // Calculate value
          baseValue = localValue / rate.get("rate");
          
          // Forward result
          options.success(baseValue);
        };
        rates.fetch(fetchOptions);
      }

      return this;
    },

    toString: function () {
      return this.get('abbreviation') + ' - ' + this.get('symbol');
    },

    validateEdit: function (attributes) {
      var params = {};
      if (attributes.abbreviation &&
          attributes.abbreviation.length !== 3) {
        params.attr = "_abbreviation".loc();
        params.length = "3";
        return XT.Error.clone('xt1006', { params: params });
      }
    }

  });
  
  /**
    @class
  
    @extends XM.Document
  */
  XM.CurrencyRate = XM.Document.extend({
    /** @scope XM.CurrencyRate.prototype */
  
    recordType: 'XM.CurrencyRate'
  
  });
  

  // ..........................................................
  // COLLECTIONS
  //

  /**
    @class

    @extends XM.Collection
  */
  XM.CurrencyCollection = XM.Collection.extend({
    /** @scope XM.CurrencyCollection.prototype */

    model: XM.Currency

  });
  
  /**
    @class
  
    @extends XM.Collection
  */
  XM.CurrencyRateCollection = XM.Collection.extend({
    /** @scope XM.CurrencyRateCollection.prototype */
  
    model: XM.CurrencyRate
  
  });
  
  _rateCache = new XM.CurrencyRateCollection();

}());
