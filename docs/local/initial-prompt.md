Pre-reqs:
 - npx create-next-app@latest
 - added .nvmrc file
 - nvm run build
 - nvm run dev
 - /init in Claude Code

Please add the Mantine UI component library. 

Attempting to use parallel agents for these three things: 

Store Page:
- Remove the list shipments route now. That was only for testing. 
- Change each product to be a card that fits around the image which should be fixed at 300x300px. The card should have title, description, image (thumbnail_url), cost (price), # left (available stock), and a "Add to Cart" button. The user can also adjust the quantity before adding to cart with up and down arrow inputs. We want this to be a marketplace where users can add products. 
- When the user clicks "Add to Cart" it should add the product to the cart and show a success message. The cart should be stored in local storage so it persists across page reloads.

Top Nav Component:
- Description: A top navigation component that the entire site uses. It should have a border and a background color, and a Cart button or link in the top right. This will eventually be added to the store page.
- The top nav should have a logo on the left side that links to the home page. The logo should be an SVG image from the public folder.
- The logo should be clickable and take the user to the store page.
- The top nav should have a title in the center that says "Online Store".
- Create the SVG logo in the public folder as `logo.svg` and use that in the top nav component. The SVG should represent a marketplace or online store theme.

- Add an account icon next to the cart button that links to a placeholder account page. This can be a simple link for now that says "Account" and points to `/account`.

Cart Page:
- Create a cart page that shows the products in the cart, the total cost, and a "Checkout" button. The checkout button should be disabled if there are no products in the cart. 
- Each product has a "Remove" button that removes the product from the cart. (trash emoji)
- The cart page should also have a "Continue Shopping" button that takes the user back to the store page.
- The cart page should also have a "Clear Cart" button that removes all products from the cart.
- The data for the cart comes from local storage. When the user adds a product to the cart, it should update the local storage. When the user removes a product, it should also update the local storage.

Checkout page: 
- Create a checkout page that shows the products in the cart, the total cost, and a "Place Order" button.
- This page will have two sections side by side. The left side will show the products in the cart, the total cost, and a "Place Order" button. The right side will have a form to enter the user's name, email, and shipping address fields. 
- The form should have validation to ensure all fields are filled out before the user can place the order.
- When the user clicks "Place Order", it should show a success message and clear the cart in local storage.
- The checkout page should also have a "Cancel" button that takes the user back to the cart page without placing the order.
- The checkout page should show shipping options and allow the user to select a shipping method. The shipping options should be hardcoded for now, but we can later integrate with a shipping API. We could use the /rates endpoint from ShipStation for this.
- The checkout page should also show the estimated delivery date based on the selected shipping method. This can be hardcoded for now, but we can later integrate with a shipping API to get real delivery dates.
- The checkout button on the cart page should take the user to the checkout page.

Theming:
Let's add the ability for a user to pick a color theme for the page. Let's add a drop down to the top nav that lets you pick the theme. Then, let's arrange our page color styling so that it obeys the current theme. It should be easy to add additional themes in a single theme file or a set of theme files. Then, go ahead and add 10 themes, including a "default" theme which shows the current colors. Remember to include button primary, secondary, disabled, nav bar background gradient, etc. Don't forget to keep contrast between font color and background high so accessibility is still achieved.

Use parallel tasks to implement the theme in each of the following pages:
- Store Page
- Top Nav Component, and also add the theme selector dropdown
- Cart Page
- Checkout Page
- Account Page
- Warehouse Settings Page

One more parallel task to build the theme files and add the 10 themes.