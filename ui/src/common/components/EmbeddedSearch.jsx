import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Map, List, fromJS } from 'immutable';
import { Row, Col, Alert } from 'antd';
import { stringify } from 'qs';

import LoadingOrChildren from './LoadingOrChildren';
import AggregationFilters from './AggregationFilters';
import NumberOfResults from './NumberOfResults';
import SortBy from './SortBy';
import SearchResults from './SearchResults';
import SearchPagination from './SearchPagination';
import http from '../http';
import { mergeWithConcattingArrays } from '../utils';

class EmbeddedSearch extends Component {
  constructor(props) {
    super(props);

    this.onPageChange = this.onPageChange.bind(this);
    this.onSortChange = this.onSortChange.bind(this);
    this.onAggregationChange = this.onAggregationChange.bind(this);

    this.state = {
      query: {
        page: 1,
        size: 10,
        sort: 'mostrecent',
      },
      numberOfResults: 0,
      aggregations: Map(),
      results: List(),
      loadingResults: false,
      loadingAggregations: false,
    };
  }

  componentDidMount() {
    this.searchForCurrentQueryState();
  }

  async onPageChange(page) {
    this.updateQueryStateAndSearch({ page });
  }

  async onSortChange(sort) {
    this.updateQueryStateAndSearch({ sort });
  }

  async onAggregationChange(aggregationKey, selections) {
    this.updateQueryStateAndSearch({ [aggregationKey]: selections });
  }

  // eslint-disable-next-line react/sort-comp
  async updateQueryStateAndSearch(partialQuery) {
    const query = {
      ...this.state.query,
      ...partialQuery,
    };
    await this.setState({ query });
    this.searchForCurrentQueryState();
  }

  searchForCurrentQueryState() {
    this.fetchSearchResults();
    this.fetchAggregations();
  }

  async fetchSearchResults() {
    const { pidType } = this.props;
    const queryString = stringify(this.getSearchQuery(), { indices: false });
    const searchUrl = `/${pidType}?${queryString}`;
    this.setState({ loadingResults: true });
    try {
      const { data } = await http.get(searchUrl);
      this.setState({
        results: fromJS(data.hits.hits),
        numberOfResults: data.hits.total,
        loadingResults: false,
      });
    } catch (error) {
      this.setState({
        hasError: true,
        loadingResults: false,
      });
    }
  }

  async fetchAggregations() {
    const { pidType, baseFacetsQuery } = this.props;
    const query = {
      ...baseFacetsQuery,
      ...this.getSearchQuery(),
    };
    const queryString = stringify(query, { indices: false });
    const searchUrl = `/${pidType}/facets?${queryString}`;
    this.setState({ loadingAggregations: true });
    try {
      const { data } = await http.get(searchUrl);
      this.setState({
        aggregations: fromJS(data.aggregations),
        loadingAggregations: false,
      });
    } catch (error) {
      this.setState({
        hasError: true,
        loadingAggregations: false,
      });
    }
  }

  getSearchQuery() {
    const { baseQuery } = this.props;
    const { query } = this.state;
    return mergeWithConcattingArrays(baseQuery, query);
  }

  renderErrorOrNull() {
    const { hasError } = this.state;
    if (hasError) {
      return (
        <Alert
          message="Something went wrong, can not search publication of the author"
          type="error"
          showIcon
          closable
        />
      );
    }
    return null;
  }

  render() {
    const { renderResultItem } = this.props;
    const {
      query,
      aggregations,
      results,
      numberOfResults,
      loadingAggregations,
      loadingResults,
    } = this.state;
    return (
      this.renderErrorOrNull() || (
        <Row gutter={32} type="flex" justify="start">
          <Col span={7}>
            <LoadingOrChildren loading={loadingAggregations}>
              <AggregationFilters
                query={query}
                aggregations={aggregations}
                numberOfResults={numberOfResults}
                onAggregationChange={this.onAggregationChange}
              />
            </LoadingOrChildren>
          </Col>
          <Col span={17}>
            <LoadingOrChildren loading={loadingResults}>
              <Row type="flex" align="middle" justify="end">
                <Col span={12}>
                  <NumberOfResults numberOfResults={numberOfResults} />
                </Col>
                <Col className="tr" span={12}>
                  <SortBy onSortChange={this.onSortChange} sort={query.sort} />
                </Col>
              </Row>
              <Row>
                <Col span={24}>
                  <SearchResults
                    renderItem={renderResultItem}
                    results={results}
                  />
                  <SearchPagination
                    page={query.page}
                    pageSize={query.size}
                    total={numberOfResults}
                    onPageChange={this.onPageChange}
                  />
                </Col>
              </Row>
            </LoadingOrChildren>
          </Col>
        </Row>
      )
    );
  }
}

EmbeddedSearch.propTypes = {
  renderResultItem: PropTypes.func.isRequired,
  pidType: PropTypes.string.isRequired,
  baseQuery: PropTypes.objectOf(PropTypes.any),
  baseFacetsQuery: PropTypes.objectOf(PropTypes.any),
};

EmbeddedSearch.defaultProps = {
  baseQuery: {},
  baseFacetsQuery: {},
};

export default EmbeddedSearch;
