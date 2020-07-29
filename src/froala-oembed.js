'use strict';

$.extend(FroalaEditor.POPUP_TEMPLATES, {
  'oembed.insert': '[_BUTTONS_][_BY_URL_LAYER_]',
  'oembed.edit': '[_BUTTONS_]'
});
$.extend(FroalaEditor.DEFAULTS, {
  oembedEditButtons: ['oembedReplace', 'oembedRemove'],
  oembedEmbedFactory: src => {
    let resolvingElement;
    if (/^<iframe/.test(src)) {
      resolvingElement = src;
    } else {
      resolvingElement = $('<iframe>').attr({src: src});
    }
    return Promise.resolve(resolvingElement);
  },
  oembedInsertButtons: ['oembedBack'],
  oembedMove: true,
  oembedSplitHtml: false,
});

FroalaEditor.PLUGINS.oembed = function (editor) {
  const refreshInsertPopup = function () {
    const popup = editor.popups.get('oembed.insert');
    const $inputs = popup.find('input, button');
    $inputs.each(function () {
      $(this).prop('disabled', false).val('').trigger('change');
    })
    popup.find('fr-buttons').toggleClass('fr-hidden', !currentOembed);
  };

  let currentOembed = null;

  /* eslint-disable camelcase */
  const initInsertPopup = function () {
    editor.popups.onRefresh('oembed.insert', refreshInsertPopup);
    const buttons = `<div class="fr-buttons">
                ${editor.button.buildList(FroalaEditor.DEFAULTS.oembedInsertButtons)}
            </div>`;
    const by_url_layer = `<div class="fr-oembed-by-url-layer fr-layer fr-active" id="fr-oembed-by-url-layer-${editor.id}">
                <div class="fr-input-line">
                    <input id="fr-oembed-by-url-layer-text-${editor.id}" type="text" placeholder="${editor.language.translate('Paste in a URL')}" tabIndex="1" aria-required="true" />
                </div>
                <div class="fr-action-buttons">
                    <button type="button" class="fr-command fr-submit" data-cmd="oembedInsertByURL" tabIndex="2" role="button">${editor.language.translate('Insert')}</button>
                </div>
            </div>`;

    return editor.popups.create('oembed.insert', {buttons, by_url_layer});
  };

  const initEditPopup = function () {
    const buttons = `<div class="fr-buttons">
                ${editor.button.buildList(FroalaEditor.DEFAULTS.oembedEditButtons)}
            </div>`;
    return editor.popups.create('oembed.edit', {buttons});
  };
  /* eslint-enable camelcase */

  const addNewOembed = function (src) {
    const $oembed = $('<div class="fr-oembed fr-uploading embed-responsive embed-responsive-16by9" contenteditable="false" draggable="true">');
    $oembed.toggleClass('fr-draggable', FroalaEditor.DEFAULTS.oembedMove);

    editor.events.focus(true);
    editor.selection.restore();
    editor.undo.saveStep();

    if (FroalaEditor.DEFAULTS.oembedSplitHTML) {
      editor.markers.split();
    } else {
      editor.markers.insert();
    }

    editor.html.wrap();
    const $marker = editor.$el.find('.fr-marker');
    if (editor.node.isLastSibling($marker) && $marker.parent().hasClass('fr-deletable')) {
      $marker.insertAfter($marker.parent());
    }
    $marker.replaceWith($oembed);
    $oembed.attr('data-oembed', JSON.stringify(src));
    editor.selection.clear();
    FroalaEditor.DEFAULTS.oembedEmbedFactory(src).then(function (embed) {
      editor.popups.hide('oembed.insert');
      $oembed.html(embed).removeClass('fr-uploading');
    });

    return $oembed;
  };

  const replaceOembed = function ($oembed, src) {
    $oembed
      .addClass('fr-uploading')
      .attr('data-oembed', JSON.stringify(src))
      .empty();
    FroalaEditor.DEFAULTS.oembedEmbedFactory(src).then(function (embed) {
      editor.popups.hide('oembed.insert');
      $oembed.html(embed).removeClass('fr-uploading');
      stopEditing($oembed);
    });
  };

  const insertOembed = function (url) {
    const replace = !!currentOembed;
    const $oembed = replace ? replaceOembed(currentOembed, url) : addNewOembed(url);

    editor.undo.saveStep();
    editor.events.trigger(replace ? 'oembed.replaced' : 'oembed.inserted', [$oembed]);
  };

  let touchScroll = false;
  const editOembed = function (e) {
    const $oembed = $(this);
    if (touchScroll && e && e.type === 'touchend') {
      return true;
    }
    if (editor.edit.isDisabled()) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      return false;
    }
    editor.toolbar.disable();

    // Hide keyboard.
    if (editor.helpers.isMobile()) {
      editor.events.disableBlur();
      editor.$el.blur();
      editor.events.enableBlur();
    }

    if (currentOembed) currentOembed.removeClass('fr-active');
    currentOembed = $oembed;
    $oembed.addClass('fr-active');

    if (editor.opts.iframe) editor.size.syncIframe();
    editor.oembed.showEditPopup($oembed);

    editor.selection.clear();
    const range = editor.doc.createRange();
    range.selectNode($oembed[0]);
    editor.selection.get().addRange(range);

    editor.button.bulkRefresh();
    return false;
  };

  const stopEditing = function (oembed) {
    if (!oembed) oembed = editor.$el.find('.fr-oembed');
    if (!oembed.length) return;
    editor.toolbar.enable();
    oembed.removeClass('fr-active');
    currentOembed = null;
  };

  return {
    _init() {
      editor.events.on('html.get', function (src) {
        const $src = $('<div>').html(src);
        $src.find('.fr-oembed')
          .removeAttr('contenteditable')
          .removeAttr('draggable')
          .removeClass('fr-draggable')
          .removeClass('fr-uploading')
          .empty();
        return $src.html();
      });

      editor.events.on('html.set', function () {
        editor.$el.find('.fr-oembed')
          .addClass('fr-draggable')
          .attr({contenteditable: false, draggable: true})
          .each(function () {
            const $this = $(this);
            try {
              const src = JSON.parse($this.attr('data-oembed'));
              FroalaEditor.DEFAULTS.oembedEmbedFactory(src).then(embed => $this.html(embed));
            } catch (e) {
              $this.attr('data-oembed', '');
            }
          });
      });

      if (editor.helpers.isMobile()) {
        editor.events.$on(editor.$el, 'touchstart', 'div.fr-oembed', function () {
          touchScroll = false;
        });

        editor.events.$on(editor.$el, 'touchmove', function () {
          touchScroll = true;
        });
      }
      editor.events.$on(editor.$el, 'mousedown', 'div.fr-oembed', function (e) {
        e.stopPropagation();
      });
      editor.events.$on(editor.$el, 'click touchend', 'div.fr-oembed', editOembed);
      editor.events.on('mouseup window.mouseup', () => stopEditing());
      editor.events.on('commands.mousedown', function ($btn) {
        if ($btn.parents('.fr-toolbar').length) stopEditing();
      });
    },

    showInsertPopup() {
      const $popup = editor.popups.get('oembed.insert') || initInsertPopup();
      editor.popups.setContainer('oembed.insert', currentOembed ? editor.$sc : editor.$tb);
      let left, top, height = 0;
      if (currentOembed) {
        const $player = currentOembed;
        height = $player.outerHeight();

        const offset = $player.offset();
        left = offset.left + $player.width() / 2;
        top = offset.top + height;
      } else if (editor.opts.toolbarInline) {
        // Set top to the popup top.
        top = $popup.offset().top - editor.helpers.getPX($popup.css('margin-top'));

        // If the popup is above apply height correction.
        if ($popup.hasClass('fr-above')) top += $popup.outerHeight();
      } else {
        const $btn = editor.$tb.find('.fr-command[data-cmd="insertOembed"]');
        const offset = $btn.offset();
        left = offset.left + $btn.outerWidth() / 2;
        top = offset.top + (editor.opts.toolbarBottom ? 10 : $btn.outerHeight() - 10);
      }
      editor.popups.show('oembed.insert', left, top, height);
      editor.accessibility.focusPopup($popup);
      editor.popups.refresh('oembed.insert');
    },
    insertByURL(url) {
      if (!url) {
        const popup = editor.popups.get('oembed.insert');
        url = (popup.find('.fr-oembed-by-url-layer input[type="text"]').val() || '').trim();
        var $inputs = popup.find('input, button');
        $inputs.each(function () {
          $(this).prop({disabled: true});
        })
      }
      insertOembed(url);
    },
    refreshBackButton($btn) {
      const showBack = currentOembed || editor.opts.toolbarInline;
      $btn.toggleClass('fr-hidden', !showBack);
      $btn.next('.fr-separator').toggleClass('fr-hidden', !showBack);

      // Since we only have this one button in the popup by default,
      // let's hide the entire button bar if the button's not shown.
      if ($btn.siblings().length < 2) $btn.parent().toggleClass('fr-hidden', !showBack);
    },

    showEditPopup($oembed) {
      const popup = 'oembed.edit';
      if (!editor.popups.get(popup)) initEditPopup();
      editor.popups.setContainer(popup, editor.$sc);
      editor.popups.refresh(popup);

      const $player = $oembed.children();
      const {left, top} = $player.offset();
      const height = $player.outerHeight();
      editor.popups.show(popup, left + $player.outerWidth() / 2, top + height, height);
    },

    replace() {
      if (!currentOembed) return;
      editor.oembed.showInsertPopup();
    },

    remove() {
      if (!currentOembed) return;
      const $oembed = currentOembed;
      if (editor.events.trigger('oembed.beforeRemove', [$oembed]) === false) return;
      editor.popups.hideAll();

      const el = $oembed[0];
      editor.selection.setBefore(el) || editor.selection.setAfter(el);
      $oembed.remove();
      editor.selection.restore();

      editor.html.fillEmptyBlocks();
      editor.events.trigger('oembed.removed', [$oembed]);
      stopEditing($oembed);
    },

    back() {
      if (currentOembed) {
        editor.oembed.showEditPopup(currentOembed);
      } else {
        editor.events.disableBlur();
        editor.selection.restore();
        editor.events.enableBlur();

        editor.popups.hide('oembed.insert');
        editor.toolbar.showInline();
      }
    }
  };
};

FroalaEditor.DefineIcon('insertOembed', {SVG_KEY: 'insertEmbed'});
FroalaEditor.RegisterCommand('insertOembed', {
  title: 'Insert Embeddable Content',
  undo: false,
  focus: true,
  refreshAfterCallback: false,
  popup: true,
  callback() {
    if (!this.popups.isVisible('oembed.insert')) return this.oembed.showInsertPopup();
    if (this.$el.find('.fr-marker').length) {
      this.events.disableBlur();
      this.selection.restore();
    }
    return this.popups.hide('oembed.insert');
  },
  plugin: 'oembed'
});


FroalaEditor.RegisterCommand('oembedInsertByURL', {
  undo: true,
  focus: true,
  callback() {
    this.oembed.insertByURL();
  }
});

FroalaEditor.DefineIcon('oembedReplace', {SVG_KEY: 'edit'});
FroalaEditor.RegisterCommand('oembedReplace', {
  title: 'Replace',
  undo: false,
  focus: false,
  popup: true,
  refreshAfterCallback: false,
  callback() {
    this.oembed.replace();
  }
});

FroalaEditor.DefineIcon('oembedRemove', {SVG_KEY: 'remove'});
FroalaEditor.RegisterCommand('oembedRemove', {
  title: 'Remove',
  callback() {
    this.oembed.remove();
  }
});

FroalaEditor.DefineIcon('oembedBack', {SVG_KEY: 'undo'});
FroalaEditor.RegisterCommand('oembedBack', {
  title: 'Back',
  undo: false,
  focus: false,
  back: true,
  callback() {
    this.oembed.back();
  },
  refresh($btn) {
    this.oembed.refreshBackButton($btn);
  }
});

if (FroalaEditor.RegisterQuickInsertButton) {
  FroalaEditor.RegisterQuickInsertButton('oembed', {
    icon: 'insertOembed',
    requiredPlugin: 'oembed',
    title: 'Insert Embeddable Content',
    undo: false,
    callback() {
      const src = prompt(this.language.translate('Paste the URL of any web content you want to insert.'));
      if (src) this.oembed.insertByURL(src);
    }
  });
}

