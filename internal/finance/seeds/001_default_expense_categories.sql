INSERT INTO categories(id,type,name) VALUES
 ('expense-groceries','expense','Groceries'),
 ('expense-restaurant-meals','expense','Restaurant meals'),
 ('expense-clothes','expense','Clothes'),
 ('expense-electricity-bill','expense','Electricity bill'),
 ('expense-apartment-rent','expense','Apartment rent'),
 ('expense-maid','expense','Maid'),
 ('expense-transportation','expense','Transportation'),
 ('expense-wifi-and-mobile','expense','WiFi and Mobile'),
 ('expense-household-misc','expense','Household misc')
ON CONFLICT(type,name) DO NOTHING;
