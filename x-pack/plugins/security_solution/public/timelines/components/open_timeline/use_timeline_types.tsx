/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import { EuiTabs, EuiTab, EuiSpacer, EuiFilterButton } from '@elastic/eui';

import { TimelineTypeLiteralWithNull, TimelineType } from '../../../../common/types/timeline';
import { SecurityPageName } from '../../../app/types';
import { getTimelineTabsUrl, useFormatUrl } from '../../../common/components/link_to';
import * as i18n from './translations';
import { TimelineTabsStyle, TimelineTab } from './types';

export const useTimelineTypes = (): {
  timelineType: TimelineTypeLiteralWithNull;
  timelineTabs: JSX.Element;
  timelineFilters: JSX.Element;
} => {
  const history = useHistory();
  const { formatUrl, search: urlSearch } = useFormatUrl(SecurityPageName.timelines);
  const { tabName } = useParams<{ pageName: string; tabName: string }>();
  const [timelineType, setTimelineTypes] = useState<TimelineTypeLiteralWithNull>(
    tabName === TimelineType.default || tabName === TimelineType.template ? tabName : null
  );

  const goToTimeline = useCallback(
    (ev) => {
      ev.preventDefault();
      history.push(getTimelineTabsUrl(TimelineType.default, urlSearch));
    },
    [history, urlSearch]
  );

  const goToTemplateTimeline = useCallback(
    (ev) => {
      ev.preventDefault();
      history.push(getTimelineTabsUrl(TimelineType.template, urlSearch));
    },
    [history, urlSearch]
  );

  const getFilterOrTabs: (timelineTabsStyle: TimelineTabsStyle) => TimelineTab[] = (
    timelineTabsStyle: TimelineTabsStyle
  ) => [
    {
      id: TimelineType.default,
      name:
        timelineTabsStyle === TimelineTabsStyle.filter
          ? i18n.FILTER_TIMELINES(i18n.TAB_TIMELINES)
          : i18n.TAB_TIMELINES,
      href: formatUrl(getTimelineTabsUrl(TimelineType.default, urlSearch)),
      disabled: false,
      onClick: goToTimeline,
    },
    {
      id: TimelineType.template,
      name:
        timelineTabsStyle === TimelineTabsStyle.filter
          ? i18n.FILTER_TIMELINES(i18n.TAB_TEMPLATES)
          : i18n.TAB_TEMPLATES,
      href: formatUrl(getTimelineTabsUrl(TimelineType.template, urlSearch)),
      disabled: false,
      onClick: goToTemplateTimeline,
    },
  ];

  const onFilterClicked = useCallback(
    (timelineTabsStyle, tabId) => {
      if (timelineTabsStyle === TimelineTabsStyle.filter && tabId === timelineType) {
        setTimelineTypes(null);
      } else {
        setTimelineTypes(tabId);
      }
    },
    [timelineType, setTimelineTypes]
  );

  const timelineTabs = useMemo(() => {
    return (
      <>
        <EuiTabs>
          {getFilterOrTabs(TimelineTabsStyle.tab).map((tab: TimelineTab) => (
            <EuiTab
              isSelected={tab.id === tabName}
              disabled={tab.disabled}
              key={`timeline-${TimelineTabsStyle.tab}-${tab.id}`}
              href={tab.href}
              onClick={(ev) => {
                tab.onClick(ev);
                onFilterClicked(TimelineTabsStyle.tab, tab.id);
              }}
            >
              {tab.name}
            </EuiTab>
          ))}
        </EuiTabs>
        <EuiSpacer size="m" />
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabName]);

  const timelineFilters = useMemo(() => {
    return (
      <>
        {getFilterOrTabs(TimelineTabsStyle.tab).map((tab: TimelineTab) => (
          <EuiFilterButton
            hasActiveFilters={tab.id === timelineType}
            key={`timeline-${TimelineTabsStyle.filter}-${tab.id}`}
            onClick={(ev: { preventDefault: () => void }) => {
              tab.onClick(ev);
              onFilterClicked.bind(null, TimelineTabsStyle.filter, tab.id);
            }}
          >
            {tab.name}
          </EuiFilterButton>
        ))}
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineType]);

  return {
    timelineType,
    timelineTabs,
    timelineFilters,
  };
};
