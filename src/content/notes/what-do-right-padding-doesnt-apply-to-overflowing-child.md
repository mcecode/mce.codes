---
title: "What Do: Right Padding Doesn’t Apply to Overflowing Child"
dateCreated: 2024-07-17
dateUpdated: 2024-07-17
---

Given this HTML:

```html
<div id="parent">
  <div id="child">Some overflowing content...</div>
</div>
```

And this CSS:

```css
#parent {
  height: 200px;
  width: 200px;
  padding: 20px;
  background: green;
  overflow-x: auto;
}
#child {
  width: 500px;
  background: greenyellow;
}
```

You'd think that there would be 20 pixels of space on all sides between `#parent` and `#child` from the set padding. For some browsers and contexts that's correct, but for others, there won't be 20 pixels of space on the right side when you scroll to show the end of `#child`.

What do if you want that right spacing for all browsers and contexts?

Instead of putting padding on `#parent`, put margin on `#child`:

```css
#parent {
  height: 200px;
  width: 200px;
  padding: 20px; // [!code --]
  background: green;
  overflow-x: auto;
}
#child {
  display: inline-block; // [!code ++]
  width: 500px;
  margin: 20px; // [!code ++]
  background: greenyellow;
}
```

**Note:** Setting `display` to `inline-block` on `#child` is important for the spacing to apply properly.

## Additional Information

I played around with different browsers and situations to test when the right spacing does and does not get applied when setting padding on `#parent`. I used Brave on Linux to represent Blink-based browsers, Safari on iOS to represent WebKit-based browsers, and Firefox on Linux to represent Gecko-based browsers because those are what I have available.

From this, I found that the right spacing is always applied on Blink-based browsers (e.g., Chrome, Edge). For WebKit-based browsers, it only gets applied if `#parent` is a `pre` element and `#child` is one of `code`, `samp`, or `kbd`. Lastly, when it comes to Gecko-based browsers, the right spacing never gets applied.

Why is there such a stark difference in the behavior of these browsers and engines?

Well, perusing through the CSS 2.1 spec as well as some Working Drafts, and by perusing of course, I mean just Ctrl+F-ing my way through them, I couldn't find a specific answer as to how to handle the situation that I've outlined so far. Maybe I just missed or misconstrued something since I don't usually read specs, but the closest thing I found to an answer is the start of the description of how `overflow: scroll` should work:

> This value indicates that the content is clipped to the padding box, but can be scrolled into view (and therefore the box is a scroll container).

And this part about how overflow scrolling should work:

> CSS also allows a box to be scroll container that allows the user to scroll clipped parts of its scrollable overflow area into view. The visual viewport of a scroll container (through which the scrollable overflow area can be viewed) coincides with its padding box, and is called the scrollport.

The way I understand it is that when a child overflows its parent and the parent is allowed to scroll to show the rest of the child, the space that's allotted for viewing that content is until the parent's padding. Notice, however, that no instruction is given on whether the right padding should be visible to the user if the end of a horizontally overflowing child is shown through scrolling. This probably left vendors to decide for themselves on how to handle that situation. Hence, the difference in behavior from browser to browser.

I must note though that there is also no instruction as to what to do with a parent's bottom padding when a child is vertically overflowing. However, this problem doesn't arise there. The parent's bottom padding is always visible across the browsers I tested when showing the end of a vertically overflowing child by scrolling the parent.

Another thing to note is that the right padding is always visible when the parent's `display` is `grid` or when it's set to `flex` and its main axis is set vertically with `flex-direction` having either `column` or `column-reverse` as its value. This might be due to the changes to the inner display type these `display` values set. It may also be connected to this clause under what constitutes a scrollable overflow area:

> Additional padding added to the end-side of the scrollable overflow rectangle as necessary to enable a scroll position that satisfies the requirements of place-content: end alignment.

And this note about padding when a grid container is also a scroll container:

> Beware the interaction with padding when the grid container is a scroll container: additional padding is defined to be added to the scrollable overflow rectangle as needed to enable place-content: end alignment of scrollable content.

## Thoughts

Browser interoperability has come a long way from the Internet Explorer days, but it's interesting to see these little peculiarities where browsers still differ in behavior. Maybe it's because this problem has existed for a long time before even Flexbox and Grid were a thing, that they just end up not being addressed (or maybe because it's not really worth caring about).

It would certainly be interesting to look at browser code to see if there's a reason why they implemented things the way they did, but I neither have the time nor the C++ knowledge to do that. So I'll leave it as is with my half-baked "research".

Why did I do this? What's the use of this? Is it worth thinking about all this just for some spacing? Well, not really. Even if you don't use the workaround stated, you'll still be fine. Chromium-based browsers have around 70% market share, so the problem doesn't exist for all of those people. If you're just showing some code with `pre` and `code` elements like me, there's also no problem for the Safari people either, bringing your support to like 90%. As for the rest, how many will even care for that right spacing 🤷‍♂️? Nonetheless, I enjoy exploring these little browser quirks from time to time and implementing workarounds for them in my sites when I remember them.

## References

- <https://stackoverflow.com/a/10055302>
- <https://www.brunildo.org/test/overscrollback.html>
- <https://www.w3.org/TR/2011/REC-CSS2-20110607/visufx.html>
- <https://www.w3.org/TR/CSS22/visufx.html>
- <https://www.w3.org/TR/css-overflow-3>
- <https://www.w3.org/TR/css-box-3>
- <https://www.w3.org/TR/css-grid-1>
